import { beforeAll, describe, expect, it } from "vitest";
import {
  createDeterministicCompanionFixture,
  discussionSnapshotFromEvidence,
  validateCompanionCandidate,
  validateBookThoughtRevise,
  countOccurrences,
  DIVISION_QUOTE_SNIPPET,
  MARKET_QUOTE_SNIPPET,
} from "@/modules/agent-os";
import {
  getSourceBlockById,
  loadWealthOfNationsBook,
} from "@/modules/book";
import {
  evidenceFromSourceBlock,
  type SourceEvidenceSnapshot,
} from "@/modules/reader-thinking";
import type { SourceDiscussionSnapshot } from "@/modules/agent-os";

let division: SourceDiscussionSnapshot;
let market: SourceDiscussionSnapshot;
let divisionEvidence: SourceEvidenceSnapshot;

beforeAll(async () => {
  const book = await loadWealthOfNationsBook();
  expect(book.ok).toBe(true);
  if (!book.ok) throw new Error("book");
  const d = getSourceBlockById(book.value.sourceBlocks, "smith.b1.c1.division");
  const m = getSourceBlockById(
    book.value.sourceBlocks,
    "smith.b1.c3.market_extent",
  );
  expect(d.ok && m.ok).toBe(true);
  if (!d.ok || !m.ok) throw new Error("sources");
  const de = evidenceFromSourceBlock(d.value, book.value.edition);
  const me = evidenceFromSourceBlock(m.value, book.value.edition);
  expect(de.ok && me.ok).toBe(true);
  if (!de.ok || !me.ok) throw new Error("evidence");
  divisionEvidence = de.value;
  division = discussionSnapshotFromEvidence(de.value, d.value.quote);
  market = discussionSnapshotFromEvidence(me.value, m.value.quote);
});

describe("T006 Guardian + fixture", () => {
  it("countOccurrences unique/multiple", () => {
    expect(countOccurrences("aaa", "aa")).toBe(2);
    expect(countOccurrences("hello world", "world")).toBe(1);
    expect(countOccurrences("x", "")).toBe(0);
  });

  it("fixture division A002 question passes Guardian", async () => {
    const fixture = createDeterministicCompanionFixture();
    const raw = await fixture.discuss({
      question_zh: "分工会让人更熟练吗？",
      source: division,
    });
    expect(raw.quote_exact).toBe(DIVISION_QUOTE_SNIPPET);
    expect(countOccurrences(division.quote, raw.quote_exact)).toBe(1);
    const g = validateCompanionCandidate(division, raw);
    expect(g.ok).toBe(true);
  });

  it("fixture market question passes Guardian", async () => {
    const fixture = createDeterministicCompanionFixture();
    const raw = await fixture.discuss({
      question_zh: "市场范围如何限制分工？",
      source: market,
    });
    expect(raw.quote_exact).toBe(MARKET_QUOTE_SNIPPET);
    const g = validateCompanionCandidate(market, raw);
    expect(g.ok).toBe(true);
  });

  it("rejects Chinese quote rewrite", () => {
    const g = validateCompanionCandidate(division, {
      answer_zh: "x",
      quote_exact: "分工提高效率",
      inference_zh: "推断",
      thought_kind: "inference",
      confidence: 0.8,
      open_question: "q",
      source_ids: [division.source_id],
      evidence_refs: [...division.evidence_refs],
    });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe("QUOTE_NOT_ENGLISH");
  });

  it("rejects quote from other SourceBlock", () => {
    const g = validateCompanionCandidate(division, {
      answer_zh: "x",
      quote_exact: MARKET_QUOTE_SNIPPET,
      inference_zh: "推断",
      thought_kind: "inference",
      confidence: 0.8,
      open_question: "q",
      source_ids: [division.source_id],
      evidence_refs: [...division.evidence_refs],
    });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe("QUOTE_NOT_FOUND");
  });

  it("rejects evidence drift", () => {
    const g = validateCompanionCandidate(division, {
      answer_zh: "x",
      quote_exact: DIVISION_QUOTE_SNIPPET,
      inference_zh: "推断",
      thought_kind: "inference",
      confidence: 0.8,
      open_question: "q",
      source_ids: [division.source_id],
      evidence_refs: ["ev_pdf_fake"],
    });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe("EVIDENCE_MISMATCH");
  });

  it("rejects confidence out of range and empty inference", () => {
    const c1 = validateCompanionCandidate(division, {
      answer_zh: "x",
      quote_exact: DIVISION_QUOTE_SNIPPET,
      inference_zh: "  ",
      thought_kind: "inference",
      confidence: 0.5,
      open_question: "q",
      source_ids: [division.source_id],
      evidence_refs: [...division.evidence_refs],
    });
    expect(c1.ok).toBe(false);
    if (!c1.ok) expect(c1.code).toBe("EMPTY_INFERENCE");

    const c2 = validateCompanionCandidate(division, {
      answer_zh: "x",
      quote_exact: DIVISION_QUOTE_SNIPPET,
      inference_zh: "推断",
      thought_kind: "inference",
      confidence: 1.5,
      open_question: "q",
      source_ids: [division.source_id],
      evidence_refs: [...division.evidence_refs],
    });
    expect(c2.ok).toBe(false);
    if (!c2.ok) expect(c2.code).toBe("CONFIDENCE_OUT_OF_RANGE");
  });

  it("rejects unknown fields", () => {
    const raw = {
      answer_zh: "x",
      quote_exact: DIVISION_QUOTE_SNIPPET,
      inference_zh: "推断",
      thought_kind: "inference" as const,
      confidence: 0.8,
      open_question: "q",
      source_ids: [division.source_id],
      evidence_refs: [...division.evidence_refs],
      secret_prompt: "leak",
    };
    const g = validateCompanionCandidate(division, raw);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe("UNKNOWN_FIELD");
  });

  it("malformed payload never throws — typed reject", () => {
    const cases: unknown[] = [
      null,
      42,
      "x",
      [],
      { answer_zh: 42, quote_exact: "x", inference_zh: "y", thought_kind: "inference", confidence: 0.5, open_question: "q", source_ids: ["a"], evidence_refs: [] },
      {
        answer_zh: "a",
        quote_exact: DIVISION_QUOTE_SNIPPET,
        inference_zh: "推断",
        thought_kind: 3,
        confidence: 0.8,
        open_question: "q",
        source_ids: [division.source_id],
        evidence_refs: [...division.evidence_refs],
      },
      {
        answer_zh: "a",
        quote_exact: DIVISION_QUOTE_SNIPPET,
        inference_zh: "推断",
        thought_kind: "inference",
        confidence: 0.8,
        open_question: "q",
        source_ids: [division.source_id],
        evidence_refs: {},
      },
    ];
    for (const raw of cases) {
      expect(() => validateCompanionCandidate(division, raw)).not.toThrow();
      const g = validateCompanionCandidate(division, raw);
      expect(g.ok).toBe(false);
    }
  });

  it("sealed division evidence carries T002 identity", () => {
    expect(divisionEvidence.fragment).toBe("Smith_0206-01_235");
    expect(divisionEvidence.pdf_page).toBe(36);
    expect(division.evidence_refs).toContain("pdf:36");
  });

  it("F38: validateBookThoughtRevise(null) typed reject, never throws", () => {
    expect(() => validateBookThoughtRevise(null)).not.toThrow();
    const g = validateBookThoughtRevise(null);
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe("MALFORMED_PAYLOAD");

    expect(() => validateBookThoughtRevise(undefined)).not.toThrow();
    expect(validateBookThoughtRevise("x").ok).toBe(false);
    expect(validateBookThoughtRevise([]).ok).toBe(false);
  });
});
