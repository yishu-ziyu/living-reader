/**
 * Deterministic Smith fixture for two canonical SourceBlocks.
 * Same question + source_id → same output. No network.
 */

import type { CompanionProviderPort } from "./port";
import type {
  CompanionProviderCandidate,
  SourceDiscussionRequest,
} from "./types";

/** Substring of division quote — unique continuous match. */
export const DIVISION_QUOTE_SNIPPET =
  "seem to have been the effects of the division of labour.";

/** Substring of market quote — unique continuous match. */
export const MARKET_QUOTE_SNIPPET = "by the extent of the market";

function normalizeQuestion(q: string): string {
  return q.trim().replace(/\s+/g, "").toLowerCase();
}

/**
 * Canonical A002 question for division SourceBlock.
 * Matches product acceptance: 「分工会让人更熟练吗？」
 */
const DIVISION_QUESTIONS = new Set([
  normalizeQuestion("分工会让人更熟练吗？"),
  normalizeQuestion("分工会让人更熟练吗?"),
  normalizeQuestion("分工会让人更熟练吗"),
]);

const MARKET_QUESTIONS = new Set([
  normalizeQuestion("市场范围如何限制分工？"),
  normalizeQuestion("市场范围如何限制分工?"),
  normalizeQuestion("市场范围如何限制分工"),
]);

export function createDeterministicCompanionFixture(): CompanionProviderPort {
  return {
    async discuss(
      request: SourceDiscussionRequest,
    ): Promise<CompanionProviderCandidate> {
      const q = normalizeQuestion(request.question_zh);
      const sid = request.source.source_id;

      if (sid === "smith.b1.c1.division" && DIVISION_QUESTIONS.has(q)) {
        // quote_exact must be unique continuous substring of active quote
        const quote_exact = pickUniqueSnippet(
          request.source.quote,
          DIVISION_QUOTE_SNIPPET,
        );
        return {
          answer_zh:
            "会。原文把劳动生产力的提高与技能、灵巧、判断力，主要归因于分工。",
          quote_exact,
          inference_zh:
            "陪读解释：在同一工种内反复练习同一操作，通常会提高熟练度；这是对原文「skill, dexterity, and judgment」的推断，不是 Smith 的中文原文。",
          thought_kind: "inference",
          confidence: 0.82,
          open_question:
            "分工是否总能提高熟练度，还取决于市场是否大到足以支撑专精？",
          source_ids: [sid],
          evidence_refs: [...request.source.evidence_refs],
        };
      }

      if (sid === "smith.b1.c3.market_extent" && MARKET_QUESTIONS.has(q)) {
        const quote_exact = pickUniqueSnippet(
          request.source.quote,
          MARKET_QUOTE_SNIPPET,
        );
        return {
          answer_zh: "会。原文明确：分工的精细程度受市场范围限制。",
          quote_exact,
          inference_zh:
            "陪读解释：若交换范围很小，专精者难以卖出全部剩余产出，因此难以专职一业。这是推断，不是译文。",
          thought_kind: "inference",
          confidence: 0.86,
          open_question: "扩大市场时，专精顺序如何影响角色链？",
          source_ids: [sid],
          evidence_refs: [...request.source.evidence_refs],
        };
      }

      // Unsupported question for fixture — still return a schema-shaped object
      // that Guardian will reject if quote cannot be unique-located, OR we
      // fail closed with empty quote so Guardian rejects.
      return {
        answer_zh: "当前演示 fixture 只支持两段 canonical 原文提问。",
        quote_exact: "",
        inference_zh: "",
        thought_kind: "inference",
        confidence: 0.1,
        open_question: "请针对分工段或市场范围段提出支持的问题。",
        source_ids: [sid],
        evidence_refs: [...request.source.evidence_refs],
      };
    },
  };
}

function pickUniqueSnippet(fullQuote: string, preferred: string): string {
  if (fullQuote.includes(preferred)) {
    // Ensure unique: preferred is designed unique in each quote.
    return preferred;
  }
  // Fallback: first 40 chars if long enough and unique once
  const clip = fullQuote.slice(0, Math.min(80, fullQuote.length));
  return clip;
}
