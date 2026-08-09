import type { AgentTurnProviderPort } from "@/modules/agent-os/turn";
import {
  AGENT_TURN_MAX_RESPONSE_BYTES,
  AgentTurnProviderError,
  deriveAgentTurnSourceSnapshotId,
  isAgentTurnProviderErrorCode,
  parseAgentTurnCandidate,
  parseAgentTurnProviderInput,
} from "./contracts";
import { cloneVoiceSourceSnapshot, type VoiceSourceSnapshot } from "@/modules/voice";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > AGENT_TURN_MAX_RESPONSE_BYTES)
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

/**
 * Browser-side AgentTurnProviderPort. The sealed snapshot is captured when the
 * adapter is created; callers can only submit a turn to the same-origin route.
 */
export function createAgentTurnClientProvider(
  sourceSnapshot: VoiceSourceSnapshot,
  fetcher: FetchLike = fetch,
): AgentTurnProviderPort {
  const sealedSourceSnapshot = cloneVoiceSourceSnapshot(sourceSnapshot);
  const sealedSourceSnapshotId = deriveAgentTurnSourceSnapshotId(
    sealedSourceSnapshot.sourceId,
    sealedSourceSnapshot.contentHash,
  );
  return {
    async decide(turn) {
      const parsedTurn = parseAgentTurnProviderInput(turn);
      if (!parsedTurn) {
        throw new AgentTurnProviderError(
          "agent_turn_invalid_request",
          "语义请求无效，世界先不动。",
          400,
        );
      }
      if (
        parsedTurn.source_snapshot_id !== sealedSourceSnapshotId ||
        parsedTurn.active_source_ids.length !== 1 ||
        parsedTurn.active_source_ids[0] !== sealedSourceSnapshot.sourceId ||
        (parsedTurn.invitation_basis &&
          parsedTurn.invitation_basis.source_snapshot_id !==
            sealedSourceSnapshotId) ||
        (parsedTurn.pending_intent &&
          (parsedTurn.pending_intent.source_snapshot_id !==
            sealedSourceSnapshotId ||
            parsedTurn.pending_intent.source_ids.length !== 1 ||
            parsedTurn.pending_intent.source_ids[0] !==
              sealedSourceSnapshot.sourceId))
      ) {
        throw new AgentTurnProviderError(
          "agent_turn_invalid_request",
          "语义请求与当前原文不一致，世界先不动。",
          400,
        );
      }
      let response: Response;
      try {
        response = await fetcher("/api/agent-turn", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            turn: parsedTurn,
            sourceSnapshot: sealedSourceSnapshot,
          }),
        });
      } catch {
        throw new AgentTurnProviderError(
          "agent_turn_provider_unavailable",
          "语义服务暂不可用，世界先不动。",
          502,
        );
      }

      const body = await parseResponseBody(response);
      if (!response.ok) {
        const rawCode =
          isRecord(body) &&
          isRecord(body.error) &&
          typeof body.error.code === "string"
            ? body.error.code
            : null;
        throw new AgentTurnProviderError(
          isAgentTurnProviderErrorCode(rawCode)
            ? rawCode
            : "agent_turn_provider_unavailable",
          "语义服务暂不可用，世界先不动。",
          response.status,
        );
      }
      if (!isRecord(body) || body.ok !== true) {
        throw new AgentTurnProviderError(
          "agent_turn_invalid_response",
          "语义服务返回内容异常，世界先不动。",
          502,
        );
      }
      const candidate = parseAgentTurnCandidate(body.candidate);
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
