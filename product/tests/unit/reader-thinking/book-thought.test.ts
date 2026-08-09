import { beforeAll, describe, expect, it } from "vitest";
import { InMemoryEventStore } from "@/infrastructure/event-store/memory";
import {
  createDeterministicCompanionFixture,
  discussionSnapshotFromEvidence,
  validateCompanionCandidate,
  type BookThoughtCandidate,
  type SourceDiscussionSnapshot,
} from "@/modules/agent-os";
import {
  getSourceBlockById,
  loadWealthOfNationsBook,
} from "@/modules/book";
import {
  acceptBookThought,
  createFixedClockPort,
  createMapSourceDiscussionResolver,
  createSequentialIdPort,
  evidenceFromSourceBlock,
  reviseBookThought,
  submitIdea,
} from "@/modules/reader-thinking";

const EXP = "exp_t006_bt";
const PRINCIPAL = "principal_t006";

let division: SourceDiscussionSnapshot;
let market: SourceDiscussionSnapshot;

beforeAll(async () => {
  const book = await loadWealthOfNationsBook();
  if (!book.ok) throw new Error("book");
  const d = getSourceBlockById(book.value.sourceBlocks, "smith.b1.c1.division");
  const m = getSourceBlockById(
    book.value.sourceBlocks,
    "smith.b1.c3.market_extent",
  );
  if (!d.ok || !m.ok) throw new Error("src");
  const de = evidenceFromSourceBlock(d.value, book.value.edition);
  const me = evidenceFromSourceBlock(m.value, book.value.edition);
  if (!de.ok || !me.ok) throw new Error("ev");
  division = discussionSnapshotFromEvidence(de.value, d.value.quote);
  market = discussionSnapshotFromEvidence(me.value, m.value.quote);
});

function ports(store: InMemoryEventStore) {
  return {
    store,
    ids: createSequentialIdPort(),
    clock: createFixedClockPort(),
    resolver: createMapSourceDiscussionResolver({
      [division.source_id]: division,
      [market.source_id]: market,
    }),
    experience_id: EXP,
    principal_id: PRINCIPAL,
  };
}

async function makeCandidate(
  source: SourceDiscussionSnapshot,
  question: string,
): Promise<BookThoughtCandidate> {
  const fixture = createDeterministicCompanionFixture();
  const raw = await fixture.discuss({ question_zh: question, source });
  const g = validateCompanionCandidate(source, raw);
  if (!g.ok) throw new Error(g.message);
  return {
    ...g.candidate,
    candidate_id: "cand_test",
    source_snapshot: source,
    stale: false,
  };
}

describe("T006 BookThought commands", () => {
  it("accept writes one book_thought; does not change ReaderIdea count", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);

    // baseline idea optional
    await submitIdea(p, {
      text: "读者想法",
      source: {
        source_id: division.source_id,
        fragment: division.fragment,
        pdf_page: division.pdf_page,
        print_page: division.print_page,
        edition_id: division.edition_id,
        edition_revision: division.edition_revision,
        edition_content_hash: division.edition_content_hash,
        source_content_hash: division.source_content_hash,
      },
      idea_id: "idea_1",
      idempotency_key: "i1",
    });

    const cand = await makeCandidate(division, "分工会让人更熟练吗？");
    const before = await store.load(EXP);
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const ideaCountBefore = before.value.filter(
      (e) => e.message_name === "reader_world.reader_idea.proposed.v1",
    ).length;

    const acc = await acceptBookThought(p, {
      candidate: cand,
      thought_id: "thought_div",
      idempotency_key: "a1",
    });
    expect(acc.ok).toBe(true);
    if (!acc.ok) return;
    expect(acc.value.revision).toBe(1);
    expect(acc.value.graph.thoughts.filter((t) => t.status === "active")).toHaveLength(
      1,
    );
    expect(acc.value.graph.ideas.filter((i) => i.status === "active")).toHaveLength(
      1,
    );

    const after = await store.load(EXP);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const thoughtEvents = after.value.filter(
      (e) => e.message_name === "agent_os.book_thought.proposed.v1",
    );
    expect(thoughtEvents).toHaveLength(1);
    const ideaCountAfter = after.value.filter(
      (e) => e.message_name === "reader_world.reader_idea.proposed.v1",
    ).length;
    expect(ideaCountAfter).toBe(ideaCountBefore);
  });

  it("duplicate accept is idempotent", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    const cand = await makeCandidate(division, "分工会让人更熟练吗？");
    const a = await acceptBookThought(p, {
      candidate: cand,
      thought_id: "thought_div",
      idempotency_key: "a1",
    });
    expect(a.ok).toBe(true);
    const b = await acceptBookThought(p, {
      candidate: cand,
      thought_id: "thought_div",
      idempotency_key: "a2",
    });
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.value.duplicate).toBe(true);
    const loaded = await store.load(EXP);
    if (loaded.ok) {
      expect(
        loaded.value.filter(
          (e) => e.message_name === "agent_os.book_thought.proposed.v1",
        ),
      ).toHaveLength(1);
    }
  });

  it("revise appends revision; supersedes previous", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    const cand = await makeCandidate(division, "分工会让人更熟练吗？");
    await acceptBookThought(p, {
      candidate: cand,
      thought_id: "thought_div",
      idempotency_key: "a1",
    });
    const rev = await reviseBookThought(p, {
      thought_id: "thought_div",
      inference_zh: "修订后的推断",
      confidence: 0.7,
      open_question: "仍开放？",
      idempotency_key: "r1",
    });
    expect(rev.ok).toBe(true);
    if (!rev.ok) return;
    expect(rev.value.revision).toBe(2);
    const hist = rev.value.graph.thoughts.filter(
      (t) => t.thought_id === "thought_div",
    );
    expect(hist).toHaveLength(2);
    expect(hist.find((t) => t.revision === 1)?.status).toBe("superseded");
    expect(hist.find((t) => t.revision === 2)?.status).toBe("active");
  });

  it("stale candidate and source drift reject with zero extra writes", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    const cand = await makeCandidate(division, "分工会让人更熟练吗？");
    const stale = await acceptBookThought(p, {
      candidate: { ...cand, stale: true },
      idempotency_key: "s1",
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("STALE_CANDIDATE");

    // Client snapshot drifted vs resolver canonical
    const drift = await acceptBookThought(p, {
      candidate: {
        ...cand,
        source_snapshot: { ...division, edition_revision: "tampered" },
      },
      idempotency_key: "s2",
    });
    expect(drift.ok).toBe(false);
    if (!drift.ok) expect(drift.error.code).toBe("SOURCE_EVIDENCE_DRIFT");

    const loaded = await store.load(EXP);
    if (loaded.ok) expect(loaded.value).toHaveLength(0);
  });

  it("F38: same thought_id + legal market candidate → SOURCE_EVIDENCE_CONFLICT, zero second event", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    const divCand = await makeCandidate(division, "分工会让人更熟练吗？");
    const a1 = await acceptBookThought(p, {
      candidate: divCand,
      thought_id: "thought_fixed",
      idempotency_key: "a1",
    });
    expect(a1.ok).toBe(true);

    // Real market quote + market snapshot (passes Guardian); same thought_id
    const marketCand = await makeCandidate(market, "市场范围如何限制分工？");
    const r = await acceptBookThought(p, {
      candidate: marketCand,
      thought_id: "thought_fixed",
      idempotency_key: "a2",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SOURCE_EVIDENCE_CONFLICT");

    const loaded = await store.load(EXP);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const thoughtEvents = loaded.value.filter(
      (e) => e.message_name === "agent_os.book_thought.proposed.v1",
    );
    expect(thoughtEvents).toHaveLength(1);
    // Still bound to division, not market
    const payload = thoughtEvents[0]!.payload as {
      source_ids: string[];
    };
    expect(payload.source_ids[0]).toBe(division.source_id);
  });

  it("F38: same thought_id same text different evidence → SOURCE_EVIDENCE_CONFLICT", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    const cand = await makeCandidate(division, "分工会让人更熟练吗？");
    await acceptBookThought(p, {
      candidate: cand,
      thought_id: "thought_fixed",
      idempotency_key: "a1",
    });
    // Same text but identity swapped to market — still conflict before revise-copy
    const conflictCand: BookThoughtCandidate = {
      ...cand,
      quote_exact: (await makeCandidate(market, "市场范围如何限制分工？"))
        .quote_exact,
      evidence_refs: [...market.evidence_refs],
      source_ids: [market.source_id],
      source_snapshot: market,
      inference_zh: cand.inference_zh,
    };
    // Rebuild as valid market-passing candidate with forced same thought text
    const marketCand = await makeCandidate(market, "市场范围如何限制分工？");
    const sameTextMarket: BookThoughtCandidate = {
      ...marketCand,
      inference_zh: cand.inference_zh,
    };
    const r = await acceptBookThought(p, {
      candidate: sameTextMarket,
      thought_id: "thought_fixed",
      idempotency_key: "a2",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SOURCE_EVIDENCE_CONFLICT");
    void conflictCand;
  });

  it("F38: malformed candidate / null revise — typed reject, never throw, zero writes", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);

    await expect(acceptBookThought(p, null as never)).resolves.toMatchObject({
      ok: false,
    });
    const badSnap = await acceptBookThought(p, {
      candidate: {
        candidate_id: "x",
        stale: false,
        answer_zh: "a",
        quote_exact: "q",
        inference_zh: "i",
        thought_kind: "inference",
        confidence: 0.5,
        open_question: "o",
        source_ids: ["s"],
        evidence_refs: [],
        source_snapshot: { source_id: "only" }, // incomplete / unknown
      } as never,
      idempotency_key: "m1",
    });
    expect(badSnap.ok).toBe(false);
    if (!badSnap.ok) {
      // unknown source_id → SOURCE_UNAVAILABLE; incomplete shape → MALFORMED/DRIFT
      expect(
        ["GUARDIAN_REJECT", "SOURCE_UNAVAILABLE", "SOURCE_EVIDENCE_DRIFT"].includes(
          badSnap.error.code,
        ),
      ).toBe(true);
    }

    await expect(reviseBookThought(p, null as never)).resolves.toMatchObject({
      ok: false,
    });
    const revNull = await reviseBookThought(p, null as never);
    expect(revNull.ok).toBe(false);
    if (!revNull.ok) expect(revNull.error.code).toBe("GUARDIAN_REJECT");

    const loaded = await store.load(EXP);
    if (loaded.ok) expect(loaded.value).toHaveLength(0);
  });

  it("F38: edition_revision / pdf_page drift → SOURCE_EVIDENCE_DRIFT zero write", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    const cand = await makeCandidate(division, "分工会让人更熟练吗？");

    const ed = await acceptBookThought(p, {
      candidate: {
        ...cand,
        source_snapshot: { ...division, edition_revision: "tampered-rev" },
      },
      idempotency_key: "d1",
    });
    expect(ed.ok).toBe(false);
    if (!ed.ok) expect(ed.error.code).toBe("SOURCE_EVIDENCE_DRIFT");

    const pg = await acceptBookThought(p, {
      candidate: {
        ...cand,
        source_snapshot: { ...division, pdf_page: 999 },
      },
      idempotency_key: "d2",
    });
    expect(pg.ok).toBe(false);
    if (!pg.ok) expect(pg.error.code).toBe("SOURCE_EVIDENCE_DRIFT");

    const loaded = await store.load(EXP);
    if (loaded.ok) expect(loaded.value).toHaveLength(0);
  });

  it("F38: low confidence without open_question → GUARDIAN_REJECT zero write", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    const cand = await makeCandidate(division, "分工会让人更熟练吗？");
    const low: BookThoughtCandidate = {
      ...cand,
      confidence: 0.4,
      open_question: null,
    };
    const r = await acceptBookThought(p, {
      candidate: low,
      idempotency_key: "low1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("GUARDIAN_REJECT");
      expect(r.error.message).toMatch(/OPEN_QUESTION_REQUIRED/);
    }
    const loaded = await store.load(EXP);
    if (loaded.ok) expect(loaded.value).toHaveLength(0);
  });

  it("F38 authenticity: evil.source / bad hash / extra source_ids / unknown root keys zero write", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    const cand = await makeCandidate(division, "分工会让人更熟练吗？");
    const hex64 = "a".repeat(64);
    const hex64b = "b".repeat(64);

    // evil.source unknown
    const evilLive = {
      ...division,
      source_id: "evil.source",
    };
    const evil = await acceptBookThought(p, {
      candidate: {
        ...cand,
        source_ids: ["evil.source"],
        source_snapshot: evilLive as SourceDiscussionSnapshot,
      },
      idempotency_key: "evil1",
    });
    expect(evil.ok).toBe(false);
    if (!evil.ok) expect(evil.error.code).toBe("SOURCE_UNAVAILABLE");

    // 1-char hash
    const shortHashLive = {
      ...division,
      source_content_hash: "x",
    };
    const shortH = await acceptBookThought(p, {
      candidate: {
        ...cand,
        source_snapshot: shortHashLive as SourceDiscussionSnapshot,
      },
      idempotency_key: "sh1",
    });
    expect(shortH.ok).toBe(false);
    if (!shortH.ok) expect(shortH.error.code).toBe("SOURCE_EVIDENCE_DRIFT");

    // non-hex 64-char hash
    const nonHexLive = {
      ...division,
      source_content_hash: "g".repeat(64),
    };
    const nonHex = await acceptBookThought(p, {
      candidate: {
        ...cand,
        source_snapshot: nonHexLive as SourceDiscussionSnapshot,
      },
      idempotency_key: "nh1",
    });
    expect(nonHex.ok).toBe(false);
    if (!nonHex.ok) expect(nonHex.error.code).toBe("SOURCE_EVIDENCE_DRIFT");

    // valid 64hex but not matching live (drift between cand and live)
    const fakeMatchCand: BookThoughtCandidate = {
      ...cand,
      source_snapshot: {
        ...division,
        source_content_hash: hex64,
        edition_content_hash: hex64b,
      },
    };
    // live stays real division — snapshotsMatch fails
    const mismatch = await acceptBookThought(p, {
      candidate: fakeMatchCand,
      idempotency_key: "mm1",
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      // either DRIFT (snapshot shape ok but mismatch) or DRIFT from parse if hash not in evidence
      expect(
        ["SOURCE_EVIDENCE_DRIFT", "GUARDIAN_REJECT"].includes(
          mismatch.error.code,
        ),
      ).toBe(true);
    }

    // extra source_ids
    const multi = await acceptBookThought(p, {
      candidate: {
        ...cand,
        source_ids: [division.source_id, "unknown.extra"],
      },
      idempotency_key: "multi1",
    });
    expect(multi.ok).toBe(false);
    if (!multi.ok) expect(multi.error.code).toBe("SOURCE_EVIDENCE_CONFLICT");

    // unknown root key on accept
    const unkRoot = await acceptBookThought(p, {
      candidate: cand,
      idempotency_key: "ur1",
      evil_field: true,
    } as never);
    expect(unkRoot.ok).toBe(false);
    if (!unkRoot.ok) {
      expect(unkRoot.error.code).toBe("GUARDIAN_REJECT");
      expect(unkRoot.error.message).toMatch(/未知字段/);
    }

    // unknown key on revise
    const revUnk = await reviseBookThought(p, {
      thought_id: "nope",
      inference_zh: "x",
      confidence: 0.9,
      open_question: null,
      idempotency_key: "ru1",
      extra: 1,
    } as never);
    expect(revUnk.ok).toBe(false);
    if (!revUnk.ok) expect(revUnk.error.message).toMatch(/未知字段/);

    // unknown key on snapshot
    const unkSnap = await acceptBookThought(p, {
      candidate: {
        ...cand,
        source_snapshot: { ...division, hack: true } as never,
      },
      idempotency_key: "us1",
    });
    expect(unkSnap.ok).toBe(false);
    if (!unkSnap.ok) expect(unkSnap.error.message).toMatch(/未知字段|MALFORMED/);

    const loaded = await store.load(EXP);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.value).toHaveLength(0);
  });

  it("F38 core: division id + market fragment/PDF/fake 64hex — reject even if self-consistent", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    const divCand = await makeCandidate(division, "分工会让人更熟练吗？");
    const hex64a = "a".repeat(64);
    const hex64b = "b".repeat(64);

    // Self-consistent spoof: claims division id, but market locator/pages/evidence + fake hashes.
    const spoofSnap: SourceDiscussionSnapshot = {
      source_id: division.source_id,
      quote: market.quote,
      fragment: market.fragment,
      pdf_page: market.pdf_page,
      print_page: market.print_page,
      edition_id: market.edition_id,
      edition_revision: market.edition_revision,
      edition_content_hash: hex64a,
      source_content_hash: hex64b,
      evidence_refs: [...market.evidence_refs],
    };
    const spoof: BookThoughtCandidate = {
      ...divCand,
      source_ids: [division.source_id],
      evidence_refs: [...market.evidence_refs],
      source_snapshot: spoofSnap,
      // keep division-valid quote_exact so Guardian isn't first fail if we ever skip match
    };

    const r = await acceptBookThought(p, {
      candidate: spoof,
      idempotency_key: "spoof1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("SOURCE_EVIDENCE_DRIFT");
    }

    // Resolver missing source → SOURCE_UNAVAILABLE
    const emptyResolver = {
      ...p,
      resolver: createMapSourceDiscussionResolver({}),
    };
    const missing = await acceptBookThought(emptyResolver, {
      candidate: divCand,
      idempotency_key: "miss1",
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("SOURCE_UNAVAILABLE");

    const loaded = await store.load(EXP);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.value).toHaveLength(0);
  });
});
