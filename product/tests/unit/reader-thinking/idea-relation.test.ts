import { beforeAll, describe, expect, it } from "vitest";
import { InMemoryEventStore } from "@/infrastructure/event-store/memory";
import {
  getSourceBlockById,
  loadWealthOfNationsBook,
} from "@/modules/book";
import {
  createFixedClockPort,
  createSequentialIdPort,
  evidenceFromSourceBlock,
  reviseIdea,
  submitIdea,
  type SourceEvidenceSnapshot,
} from "@/modules/reader-thinking";
import {
  acceptAndCommitRelation,
  proposeCanonicalRelation,
  rejectRelation,
  reviseRelation,
  tryCanonicalConstrainedBy,
} from "@/modules/agent-os";
import {
  createSessionActor,
  safeAttemptTransition,
  getSessionContext,
} from "@/modules/session/reader-session.test-harness";
import { foldReadingGraph } from "@/modules/reader-world/projections/reading-graph";

const EXP = "exp_t005_unit";
const PRINCIPAL = "principal_t005";

let divisionSnap: SourceEvidenceSnapshot;
let marketSnap: SourceEvidenceSnapshot;

beforeAll(async () => {
  // F33: real T002 path — loadWealthOfNationsBook + getSourceBlockById
  const book = await loadWealthOfNationsBook();
  expect(book.ok).toBe(true);
  if (!book.ok) throw new Error("book load failed");
  const division = getSourceBlockById(
    book.value.sourceBlocks,
    "smith.b1.c1.division",
  );
  const market = getSourceBlockById(
    book.value.sourceBlocks,
    "smith.b1.c3.market_extent",
  );
  expect(division.ok).toBe(true);
  expect(market.ok).toBe(true);
  if (!division.ok || !market.ok) throw new Error("source missing");
  const d = evidenceFromSourceBlock(division.value, book.value.edition);
  const m = evidenceFromSourceBlock(market.value, book.value.edition);
  expect(d.ok).toBe(true);
  expect(m.ok).toBe(true);
  if (!d.ok || !m.ok) throw new Error("evidence seal failed");
  divisionSnap = d.value;
  marketSnap = m.value;
});

function ports(store: InMemoryEventStore) {
  return {
    store,
    ids: createSequentialIdPort(),
    clock: createFixedClockPort(),
    experience_id: EXP,
    principal_id: PRINCIPAL,
  };
}

describe("T005 ReaderIdea + Relation", () => {
  it("submitIdea empty / invalid source fail-closed", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    const empty = await submitIdea(p, {
      text: "   ",
      source: divisionSnap,
      idempotency_key: "k1",
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.code).toBe("EMPTY_TEXT");

    const bad = await submitIdea(p, {
      text: "hello",
      source: { ...divisionSnap, source_id: "unknown.source" as never },
      idempotency_key: "k2",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("INVALID_SOURCE");
  });

  it("submit + revise appends revision; history keeps superseded", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    const a = await submitIdea(p, {
      text: "分工提高效率",
      source: divisionSnap,
      idea_id: "idea_div",
      idempotency_key: "sub1",
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.revision).toBe(1);

    const b = await reviseIdea(p, {
      idea_id: "idea_div",
      text: "分工提高效率（修订）",
      idempotency_key: "rev1",
    });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.value.revision).toBe(2);
    const hist = b.value.graph.ideas.filter((i) => i.idea_id === "idea_div");
    expect(hist).toHaveLength(2);
    expect(hist.find((i) => i.revision === 1)?.status).toBe("superseded");
    expect(hist.find((i) => i.revision === 2)?.status).toBe("active");
    expect(b.value.graph.idea_basis_revision).toBe(2);
  });

  it("canonical propose only with both active ideas; reject no auto-repropose", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    const onlyOne = await submitIdea(p, {
      text: "专业化",
      source: divisionSnap,
      idea_id: "idea_div",
      idempotency_key: "d1",
    });
    expect(onlyOne.ok).toBe(true);
    if (!onlyOne.ok) return;
    expect(tryCanonicalConstrainedBy(onlyOne.value.graph)).toBeNull();

    const both = await submitIdea(p, {
      text: "市场限制",
      source: marketSnap,
      idea_id: "idea_mkt",
      idempotency_key: "m1",
    });
    expect(both.ok).toBe(true);
    if (!both.ok) return;
    expect(tryCanonicalConstrainedBy(both.value.graph)).not.toBeNull();

    const prop = await proposeCanonicalRelation(p, { idempotency_key: "p1" });
    expect(prop.ok).toBe(true);
    if (!prop.ok) return;
    const rid = prop.value.relation_id!;
    const rejected = await rejectRelation(p, {
      relation_id: rid,
      idempotency_key: "rj1",
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    const rel = rejected.value.graph.relations.find((r) => r.relation_id === rid);
    expect(rel?.review_status).toBe("rejected");
    // no auto re-propose
    expect(
      rejected.value.graph.relations.filter(
        (r) => r.relation_id === rid && r.review_status === "proposed",
      ),
    ).toHaveLength(0);
  });

  it("accept commits graph; idea revise makes stale", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    await submitIdea(p, {
      text: "A",
      source: divisionSnap,
      idea_id: "idea_div",
      idempotency_key: "d1",
    });
    await submitIdea(p, {
      text: "B",
      source: marketSnap,
      idea_id: "idea_mkt",
      idempotency_key: "m1",
    });
    const prop = await proposeCanonicalRelation(p, { idempotency_key: "p1" });
    expect(prop.ok).toBe(true);
    if (!prop.ok) return;
    const rid = prop.value.relation_id!;
    const acc = await acceptAndCommitRelation(p, {
      relation_id: rid,
      idempotency_key: "a1",
    });
    expect(acc.ok).toBe(true);
    if (!acc.ok) return;
    expect(acc.value.graph.graph_revision).toBe(1);
    expect(acc.value.graph.accepted_relation_ids).toContain(rid);
    expect(acc.value.graph.graph_stale).toBe(false);

    const revIdea = await reviseIdea(p, {
      idea_id: "idea_div",
      text: "专业化（新）",
      idempotency_key: "rev2",
    });
    expect(revIdea.ok).toBe(true);
    if (!revIdea.ok) return;
    expect(revIdea.value.graph.graph_stale).toBe(true);
    const rel = revIdea.value.graph.relations.find((r) => r.relation_id === rid);
    expect(rel?.stale).toBe(true);
  });

  it("F32: revise does not double-append same corrections in review_history", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    await submitIdea(p, {
      text: "A",
      source: divisionSnap,
      idea_id: "idea_div",
      idempotency_key: "d1",
    });
    await submitIdea(p, {
      text: "B",
      source: marketSnap,
      idea_id: "idea_mkt",
      idempotency_key: "m1",
    });
    const prop = await proposeCanonicalRelation(p, { idempotency_key: "p1" });
    expect(prop.ok).toBe(true);
    if (!prop.ok) return;
    const rid = prop.value.relation_id!;
    const revised = await reviseRelation(p, {
      relation_id: rid,
      corrections: "措辞微调",
      idempotency_key: "rr1",
    });
    expect(revised.ok).toBe(true);
    if (!revised.ok) return;
    const rel = revised.value.graph.relations.find((r) => r.relation_id === rid)!;
    const revisedEntries = rel.review_history.filter(
      (h) => h.decision === "revised" && h.corrections === "措辞微调",
    );
    expect(revisedEntries).toHaveLength(1);
    expect(rel.corrections).toBe("措辞微调");
  });

  it("F32: reload after revise keeps single history entry (no double)", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    await submitIdea(p, {
      text: "A",
      source: divisionSnap,
      idea_id: "idea_div",
      idempotency_key: "d1",
    });
    await submitIdea(p, {
      text: "B",
      source: marketSnap,
      idea_id: "idea_mkt",
      idempotency_key: "m1",
    });
    const prop = await proposeCanonicalRelation(p, { idempotency_key: "p1" });
    expect(prop.ok).toBe(true);
    if (!prop.ok) return;
    const rid = prop.value.relation_id!;
    await reviseRelation(p, {
      relation_id: rid,
      corrections: "措辞微调",
      idempotency_key: "rr1",
    });
    const loaded = await store.load(EXP);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const rebuilt = foldReadingGraph(EXP, loaded.value);
    const rel = rebuilt.relations.find((r) => r.relation_id === rid)!;
    const revisedEntries = rel.review_history.filter(
      (h) => h.decision === "revised" && h.corrections === "措辞微调",
    );
    expect(revisedEntries).toHaveLength(1);
    expect(rel.corrections).toBe("措辞微调");
    expect(rel.review_status).toBe("proposed");
  });

  it("F33: idea evidence_refs from real T002 SourceBlock snapshot", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    const a = await submitIdea(p, {
      text: "分工",
      source: divisionSnap,
      idea_id: "idea_div",
      idempotency_key: "d1",
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const idea = a.value.graph.ideas.find((i) => i.idea_id === "idea_div")!;
    expect(idea.evidence_refs).toEqual(divisionSnap.evidence_refs);
    expect(idea.evidence_refs.some((e) => e.includes("Smith_0206-01_235"))).toBe(
      true,
    );
    expect(idea.evidence_refs).toContain("pdf:36");
    expect(idea.evidence_refs).toContain("print:5");
    expect(idea.evidence_refs.some((e) => e.startsWith("content_hash:"))).toBe(
      true,
    );
    expect(idea.evidence_refs).not.toContain("ev_pdf_5");
    expect(idea.evidence_refs).not.toContain("ev_pdf_19");

    const m = await submitIdea(p, {
      text: "市场",
      source: marketSnap,
      idea_id: "idea_mkt",
      idempotency_key: "m1",
    });
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const mIdea = m.value.graph.ideas.find((i) => i.idea_id === "idea_mkt")!;
    expect(mIdea.evidence_refs.some((e) => e.includes("Smith_0206-01_251"))).toBe(
      true,
    );
    expect(mIdea.evidence_refs).toContain("pdf:45");
    expect(mIdea.evidence_refs).toContain("print:19");
  });

  it("F33: tampered locator/hash → SOURCE_EVIDENCE_DRIFT zero write", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);

    const badFrag = await submitIdea(p, {
      text: "x",
      source: { ...divisionSnap, fragment: "FAKE_LOCATOR" },
      idempotency_key: "t1",
    });
    expect(badFrag.ok).toBe(false);
    if (!badFrag.ok) expect(badFrag.error.code).toBe("SOURCE_EVIDENCE_DRIFT");

    const emptyHash = await submitIdea(p, {
      text: "x",
      source: { ...divisionSnap, source_content_hash: "" },
      idempotency_key: "t2",
    });
    expect(emptyHash.ok).toBe(false);
    if (!emptyHash.ok) expect(emptyHash.error.code).toBe("SOURCE_EVIDENCE_DRIFT");

    const shortHash = await submitIdea(p, {
      text: "x",
      source: { ...divisionSnap, source_content_hash: "deadbeef" },
      idempotency_key: "t3",
    });
    expect(shortHash.ok).toBe(false);
    if (!shortHash.ok) expect(shortHash.error.code).toBe("SOURCE_EVIDENCE_DRIFT");

    const badEdition = await submitIdea(p, {
      text: "x",
      source: { ...divisionSnap, edition_content_hash: "not-a-hash" },
      idempotency_key: "t4",
    });
    expect(badEdition.ok).toBe(false);
    if (!badEdition.ok) expect(badEdition.error.code).toBe("SOURCE_EVIDENCE_DRIFT");

    const loaded = await store.load(EXP);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.value).toHaveLength(0);
  });

  it("F33: fixed idea_id + same text + different source/evidence → conflict", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    const a = await submitIdea(p, {
      text: "same text",
      source: divisionSnap,
      idea_id: "idea_fixed",
      idempotency_key: "f1",
    });
    expect(a.ok).toBe(true);

    const conflict = await submitIdea(p, {
      text: "same text",
      source: marketSnap, // different source/evidence identity
      idea_id: "idea_fixed",
      idempotency_key: "f2",
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(conflict.error.code).toBe("SOURCE_EVIDENCE_CONFLICT");
    }
    // must not have written a second event
    const loaded = await store.load(EXP);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value).toHaveLength(1);
    }

    // same identity + same text → duplicate ok
    const dup = await submitIdea(p, {
      text: "same text",
      source: divisionSnap,
      idea_id: "idea_fixed",
      idempotency_key: "f3",
    });
    expect(dup.ok).toBe(true);
    if (dup.ok) expect(dup.value.duplicate).toBe(true);
  });

  it("F31: real idea_basis_revision on RELATION_REVIEWED + graph_revision commits", () => {
    const actor = createSessionActor({
      experience_id: EXP,
      source_snapshot_ids: [
        "smith.b1.c1.division",
        "smith.b1.c3.market_extent",
      ],
    });
    safeAttemptTransition(actor, { type: "ENTER_REVIEWING_GRAPH" });
    const reviewed = safeAttemptTransition(actor, {
      type: "RELATION_REVIEWED",
      relation_id: "rel_specialization_constrained_by_market",
      basis_revision: 2,
    });
    expect(reviewed.accepted).toBe(true);
    const committed = safeAttemptTransition(actor, {
      type: "GRAPH_COMMITTED",
      graph_revision: 1,
      accepted_relation_ids: ["rel_specialization_constrained_by_market"],
    });
    expect(committed.accepted).toBe(true);
    expect(getSessionContext(actor).relation_basis_revision).toBe(2);
    expect(getSessionContext(actor).graph_revision).toBe(1);
  });

  it("fixed idea_id different text appends revision not clobber r1", async () => {
    const store = new InMemoryEventStore();
    const p = ports(store);
    const a = await submitIdea(p, {
      text: "first",
      source: divisionSnap,
      idea_id: "idea_fixed",
      idempotency_key: "f1",
    });
    expect(a.ok).toBe(true);
    const b = await submitIdea(p, {
      text: "second",
      source: divisionSnap,
      idea_id: "idea_fixed",
      idempotency_key: "f2",
    });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.value.revision).toBe(2);
    const versions = b.value.graph.ideas.filter((i) => i.idea_id === "idea_fixed");
    expect(versions).toHaveLength(2);
    expect(versions.find((i) => i.revision === 1)?.status).toBe("superseded");
  });
});
