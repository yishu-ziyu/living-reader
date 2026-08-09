import { describe, expect, test, vi } from "vitest";
import {
  AgentTurnProviderError,
  deriveAgentTurnSourceSnapshotId,
  type VerifiedAgentTurnSource,
} from "@/modules/agent-os/provider";
import { createReadingAgentRuntimeProvider } from "@/modules/agent-os/provider/runtime-client";
import type { AgentTurnProviderInput } from "@/modules/agent-os/turn";

const source: VerifiedAgentTurnSource = {
  source_id: "source-1",
  edition_id: "edition-1",
  content_hash: "hash-1",
  title: "市场范围",
  quote: "The division of labour is limited by the extent of the market.",
};

const turn: AgentTurnProviderInput = {
  turn_id: "turn-1",
  channel: "text",
  final_text: "修条路，把货卖到隔壁城去",
  source_snapshot_id: deriveAgentTurnSourceSnapshotId(
    source.source_id,
    source.content_hash,
  ),
  active_source_ids: [source.source_id],
  world_basis: {
    experience_id: "experience-1",
    world_id: "wool-town-v1",
    graph_revision: 2,
    world_revision: 0,
    ruleset_id: "wool-town-rules-v1",
  },
  invitation_basis: null,
  recent_turns: [],
  invited_question_keys: [],
  pending_intent: null,
};

const candidate = {
  mode: "act",
  intent_class: "executable_action",
  relevance: "mechanism_adjacent",
  confidence: "high",
  target_source_ids: [source.source_id],
  evidence_refs: [],
  companion_line: "好，路往隔壁城铺。",
  proposed_action_id: "expand_market",
  reason_codes: ["runtime_candidate"],
} as const;

describe("createReadingAgentRuntimeProvider", () => {
  test("posts the sealed source and turn to the loopback runtime with cancellation", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async () =>
      Response.json({ ok: true, candidate }),
    );
    const provider = createReadingAgentRuntimeProvider({
      source,
      signal: controller.signal,
      runtimeUrl: "http://127.0.0.1:4317",
      fetcher,
    });

    await expect(provider.decide(turn)).resolves.toEqual(candidate);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:4317/v1/agent-turn",
      expect.objectContaining({
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({ source, turn }),
      }),
    );
  });

  test("preserves a typed runtime rejection without exposing its message", async () => {
    const provider = createReadingAgentRuntimeProvider({
      source,
      fetcher: async () =>
        Response.json(
          {
            ok: false,
            error: {
              code: "agent_turn_not_configured",
              message: "secret upstream detail",
            },
          },
          { status: 503 },
        ),
    });

    await expect(provider.decide(turn)).rejects.toMatchObject({
      code: "agent_turn_not_configured",
      status: 503,
      message: "语义服务暂不可用，世界先不动。",
    } satisfies Partial<AgentTurnProviderError>);
  });

  test("rejects a malformed success envelope", async () => {
    const provider = createReadingAgentRuntimeProvider({
      source,
      fetcher: async () => Response.json({ ok: true, candidate: { mode: "act" } }),
    });

    await expect(provider.decide(turn)).rejects.toMatchObject({
      code: "agent_turn_invalid_response",
      status: 502,
    } satisfies Partial<AgentTurnProviderError>);
  });
});
