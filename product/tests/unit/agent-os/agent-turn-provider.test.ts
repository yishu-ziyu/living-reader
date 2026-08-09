import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/agent-turn/route";
import {
  AgentTurnProviderError,
  createAgentTurnClientProvider,
  deriveAgentTurnSourceSnapshotId,
  type VerifiedAgentTurnSource,
} from "@/modules/agent-os/provider";
import { getSourceBlockById, loadWealthOfNationsBook } from "@/modules/book";
import { snapshotVoiceSource } from "@/modules/voice";
import type { AgentTurnProviderInput } from "@/modules/agent-os/turn";

const originalFetch = globalThis.fetch;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const source: VerifiedAgentTurnSource = {
  source_id: "smith.b1.c3.market_extent",
  edition_id: "oll-wealth-of-nations-1904",
  content_hash: "source-hash",
  title: "Of the Extent of the Market",
  quote: "The division of labour is limited by the extent of the market.",
};

function input(
  overrides: Partial<AgentTurnProviderInput> = {},
): AgentTurnProviderInput {
  return {
    turn_id: "turn-provider-1",
    channel: "text",
    final_text: "修条路，把货卖到隔壁城去",
    source_snapshot_id: deriveAgentTurnSourceSnapshotId(
      "smith.b1.c3.market_extent",
      "source-hash",
    ),
    active_source_ids: ["smith.b1.c3.market_extent"],
    world_basis: {
      experience_id: "exp_test",
      world_id: "wool-town-v1",
      graph_revision: 2,
      world_revision: 0,
      ruleset_id: "wool-town-rules-v1",
    },
    recent_turns: [
      {
        turn_id: "previous-reader",
        role: "reader",
        visible_text: "市场太小会卖不掉。",
      },
    ],
    pending_intent: null,
    ...overrides,
  };
}

function candidate() {
  return {
    mode: "act",
    intent_class: "executable_action",
    relevance: "mechanism_adjacent",
    confidence: "high",
    target_source_ids: ["smith.b1.c3.market_extent"],
    evidence_refs: [],
    open_question: null,
    companion_line: "好，路往隔壁城铺。",
    proposed_action_id: "expand_market",
    pending_action_id: null,
    reason_codes: ["clear_action"],
  };
}



afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("AgentTurn provider seams", () => {

  it("client adapter seals its source snapshot and posts only turn plus snapshot", async () => {
    const clientSnapshot = {
      sourceId: "smith.b1.c3.market_extent",
      editionId: source.edition_id,
      title: source.title,
      quote: source.quote,
      contentHash: source.content_hash,
      pdfPages: [45],
    } as const;
    const fetcher = vi.fn<FetchLike>(async () =>
      Response.json({ ok: true, candidate: candidate() }),
    );
    const provider = createAgentTurnClientProvider(clientSnapshot, fetcher);
    const mutable = input({ channel: "voice" });

    await expect(provider.decide(mutable)).resolves.toMatchObject({
      mode: "act",
      proposed_action_id: "expand_market",
    });
    mutable.final_text = "tampered after request";
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [, init] = fetcher.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      turn: input({ channel: "voice" }),
      sourceSnapshot: clientSnapshot,
    });

    await expect(
      provider.decide(
        input({
          source_snapshot_id: clientSnapshot.sourceId,
        }),
      ),
    ).rejects.toMatchObject({
      code: "agent_turn_invalid_request",
    } satisfies Partial<AgentTurnProviderError>);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("route rejects cross-origin and stale source snapshots before calling the runtime", async () => {
    const fetcher = vi.fn<FetchLike>(async () =>
      Response.json({ ok: true, candidate: candidate() }),
    );
    globalThis.fetch = fetcher as typeof globalThis.fetch;

    const crossOrigin = await POST(
      new Request("http://localhost/api/agent-turn", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://elsewhere.example",
          host: "localhost",
        },
        body: JSON.stringify({ turn: input(), sourceSnapshot: {} }),
      }),
    );
    expect(crossOrigin.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();

    const book = await loadWealthOfNationsBook();
    expect(book.ok).toBe(true);
    if (!book.ok) throw new Error("book unavailable");
    const block = getSourceBlockById(
      book.value.sourceBlocks,
      "smith.b1.c3.market_extent",
    );
    expect(block.ok).toBe(true);
    if (!block.ok) throw new Error("source unavailable");
    const stale = { ...snapshotVoiceSource(block.value), contentHash: "stale" };
    const response = await POST(
      new Request("http://localhost/api/agent-turn", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          host: "localhost",
        },
        body: JSON.stringify({ turn: input(), sourceSnapshot: stale }),
      }),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "agent_turn_source_stale" },
    });
    expect(fetcher).not.toHaveBeenCalled();

    const forgedKey = await POST(
      new Request("http://localhost/api/agent-turn", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          host: "localhost",
        },
        body: JSON.stringify({
          turn: { ...input(), idempotency_key: "client-forged" },
          sourceSnapshot: snapshotVoiceSource(block.value),
        }),
      }),
    );
    expect(forgedKey.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();

    const missingContentIdentity = await POST(
      new Request("http://localhost/api/agent-turn", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          host: "localhost",
        },
        body: JSON.stringify({
          turn: input({
            source_snapshot_id: block.value.sourceId,
          }),
          sourceSnapshot: snapshotVoiceSource(block.value),
        }),
      }),
    );
    expect(missingContentIdentity.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();

    const verified = await POST(
      new Request("http://localhost/api/agent-turn", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          host: "localhost",
        },
        body: JSON.stringify({
          turn: input({
            source_snapshot_id: deriveAgentTurnSourceSnapshotId(
              block.value.sourceId,
              block.value.contentHash,
            ),
          }),
          sourceSnapshot: snapshotVoiceSource(block.value),
        }),
      }),
    );
    expect(verified.status).toBe(200);
    await expect(verified.json()).resolves.toMatchObject({
      ok: true,
      candidate: { proposed_action_id: "expand_market" },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:4317/v1/agent-turn",
    );
  });
});
