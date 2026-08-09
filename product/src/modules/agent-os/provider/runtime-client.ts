import type { AgentTurnProviderPort } from "@/modules/agent-os/turn";
import {
  AGENT_TURN_MAX_RESPONSE_BYTES,
  AgentTurnProviderError,
  deriveAgentTurnSourceSnapshotId,
  isAgentTurnProviderErrorCode,
  parseAgentTurnCandidate,
  parseAgentTurnProviderInput,
  type VerifiedAgentTurnSource,
} from "./contracts";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type UnknownRecord = Record<string, unknown>;

export type ReadingAgentRuntimeProviderOptions = Readonly<{
  source: VerifiedAgentTurnSource;
  signal?: AbortSignal;
  runtimeUrl?: string;
  fetcher?: FetchLike;
}>;

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

async function parseRuntimeResponse(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) ||
      Number(declaredLength) > AGENT_TURN_MAX_RESPONSE_BYTES)
  ) {
    throw new AgentTurnProviderError(
      "agent_turn_invalid_response",
      "语义服务返回内容异常，世界先不动。",
      502,
    );
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new AgentTurnProviderError(
      "agent_turn_invalid_response",
      "语义服务返回内容异常，世界先不动。",
      502,
    );
  }
  if (utf8Length(text) > AGENT_TURN_MAX_RESPONSE_BYTES) {
    throw new AgentTurnProviderError(
      "agent_turn_invalid_response",
      "语义服务返回内容异常，世界先不动。",
      502,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AgentTurnProviderError(
      "agent_turn_invalid_response",
      "语义服务返回内容异常，世界先不动。",
      502,
    );
  }
}

export function createReadingAgentRuntimeProvider({
  source,
  signal,
  runtimeUrl = process.env.READING_AGENT_RUNTIME_URL?.trim() ||
    "http://127.0.0.1:4317",
  fetcher = fetch,
}: ReadingAgentRuntimeProviderOptions): AgentTurnProviderPort {
  const sourceSnapshotId = deriveAgentTurnSourceSnapshotId(
    source.source_id,
    source.content_hash,
  );
  const endpoint = `${runtimeUrl.replace(/\/+$/, "")}/v1/agent-turn`;

  return {
    async decide(turn) {
      const parsedTurn = parseAgentTurnProviderInput(turn);
      if (
        !parsedTurn ||
        parsedTurn.source_snapshot_id !== sourceSnapshotId ||
        parsedTurn.active_source_ids.length !== 1 ||
        parsedTurn.active_source_ids[0] !== source.source_id ||
        (parsedTurn.invitation_basis &&
          parsedTurn.invitation_basis.source_snapshot_id !== sourceSnapshotId) ||
        (parsedTurn.pending_intent &&
          (parsedTurn.pending_intent.source_snapshot_id !== sourceSnapshotId ||
            parsedTurn.pending_intent.source_ids.length !== 1 ||
            parsedTurn.pending_intent.source_ids[0] !== source.source_id))
      ) {
        throw new AgentTurnProviderError(
          "agent_turn_invalid_request",
          "语义请求与当前原文不一致，世界先不动。",
          400,
        );
      }

      let response: Response;
      try {
        response = await fetcher(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, turn: parsedTurn }),
          signal,
        });
      } catch {
        throw new AgentTurnProviderError(
          "agent_turn_provider_unavailable",
          "语义服务暂不可用，世界先不动。",
          502,
        );
      }

      const body = await parseRuntimeResponse(response);
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new AgentTurnProviderError(
          "agent_turn_invalid_response",
          "语义服务返回内容异常，世界先不动。",
          502,
        );
      }
      const envelope = body as UnknownRecord;
      if (!response.ok) {
        const rawError = envelope.error;
        const error =
          typeof rawError === "object" && rawError !== null && !Array.isArray(rawError)
            ? (rawError as UnknownRecord)
            : null;
        const rawCode = typeof error?.code === "string" ? error.code : null;
        throw new AgentTurnProviderError(
          isAgentTurnProviderErrorCode(rawCode)
            ? rawCode
            : "agent_turn_provider_unavailable",
          "语义服务暂不可用，世界先不动。",
          response.status,
        );
      }
      if (envelope.ok !== true) {
        throw new AgentTurnProviderError(
          "agent_turn_invalid_response",
          "语义服务返回内容异常，世界先不动。",
          502,
        );
      }
      const candidate = parseAgentTurnCandidate(envelope.candidate);
      if (!candidate) {
        throw new AgentTurnProviderError(
          "agent_turn_invalid_response",
          "语义服务返回内容异常，世界先不动。",
          502,
        );
      }
      return candidate;
    },
  };
}
