import {
  AGENT_TURN_MAX_REQUEST_BYTES,
  AgentTurnProviderError,
  parseAgentTurnProviderInput,
  sameWorldBasis,
} from "@/modules/agent-os/provider";
import {
  assertAgentTurnSameOrigin,
  currentAgentTurnSourceSnapshotId,
  createReadingAgentRuntimeProvider,
  parseAgentTurnSourceSnapshot,
  verifyAgentTurnSource,
} from "@/modules/agent-os/provider/server";
import type { AgentTurnProviderInput } from "@/modules/agent-os/turn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function hasOnlyVoiceSourceSnapshotKeys(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const allowed = new Set([
    "sourceId",
    "editionId",
    "title",
    "quote",
    "contentHash",
    "pdfPages",
  ]);
  return Object.keys(value).every((key) => allowed.has(key));
}

async function parseJsonBody(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > AGENT_TURN_MAX_REQUEST_BYTES)
  ) {
    throw new AgentTurnProviderError(
      "agent_turn_invalid_request",
      "语义请求无效，世界先不动。",
      413,
    );
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new AgentTurnProviderError(
      "agent_turn_invalid_request",
      "语义请求无效，世界先不动。",
      400,
    );
  }
  if (utf8Length(text) > AGENT_TURN_MAX_REQUEST_BYTES) {
    throw new AgentTurnProviderError(
      "agent_turn_invalid_request",
      "语义请求无效，世界先不动。",
      413,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AgentTurnProviderError(
      "agent_turn_invalid_request",
      "语义请求无效，世界先不动。",
      400,
    );
  }
}

function assertSealedTurnMatchesSource(
  turn: AgentTurnProviderInput,
  source: { source_id: string; content_hash: string },
) {
  const sourceSnapshotId = currentAgentTurnSourceSnapshotId(source);
  if (
    turn.source_snapshot_id !== sourceSnapshotId ||
    turn.active_source_ids.length !== 1 ||
    turn.active_source_ids[0] !== source.source_id
  ) {
    throw new AgentTurnProviderError(
      "agent_turn_invalid_request",
      "语义请求与当前原文不一致，世界先不动。",
      400,
    );
  }
  const pending = turn.pending_intent;
  if (!pending) return;
  if (
    !turn.world_basis ||
    pending.source_snapshot_id !== turn.source_snapshot_id ||
    pending.source_ids.length !== 1 ||
    pending.source_ids[0] !== source.source_id ||
    !sameWorldBasis(pending.basis, turn.world_basis)
  ) {
    throw new AgentTurnProviderError(
      "agent_turn_invalid_request",
      "语义请求与当前原文不一致，世界先不动。",
      400,
    );
  }
}

function agentTurnErrorResponse(error: unknown): Response {
  if (error instanceof AgentTurnProviderError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  return Response.json(
    {
      ok: false,
      error: {
        code: "agent_turn_internal_error",
        message: "语义服务暂不可用，世界先不动。",
      },
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    assertAgentTurnSameOrigin(request);
    const body = await parseJsonBody(request);
    if (
      !isRecord(body) ||
      Object.keys(body).some((key) => key !== "turn" && key !== "sourceSnapshot")
    ) {
      throw new AgentTurnProviderError(
        "agent_turn_invalid_request",
        "语义请求无效，世界先不动。",
        400,
      );
    }
    const turn = parseAgentTurnProviderInput(body.turn);
    const sourceSnapshot = parseAgentTurnSourceSnapshot(body.sourceSnapshot);
    if (!turn || !sourceSnapshot || !hasOnlyVoiceSourceSnapshotKeys(body.sourceSnapshot)) {
      throw new AgentTurnProviderError(
        "agent_turn_invalid_request",
        "语义请求无效，世界先不动。",
        400,
      );
    }

    const source = await verifyAgentTurnSource(sourceSnapshot);
    assertSealedTurnMatchesSource(turn, source);
    const candidate = await createReadingAgentRuntimeProvider({
      source,
      signal: request.signal,
    }).decide(turn);
    return Response.json({ ok: true, candidate });
  } catch (error) {
    return agentTurnErrorResponse(error);
  }
}
