/**
 * OriginalGuardian — pure validation of companion candidates against live SourceBlock snapshot.
 * Fail-closed; zero EventStore side effects.
 * Never throws on malformed provider payloads (typed reject only).
 */

import type {
  CompanionProviderCandidate,
  SourceDiscussionSnapshot,
  ThoughtKind,
} from "@/modules/agent-os/companion/types";

export type GuardianErrorCode =
  | "SOURCE_UNAVAILABLE"
  | "SOURCE_EVIDENCE_DRIFT"
  | "QUOTE_NOT_FOUND"
  | "QUOTE_NOT_UNIQUE"
  | "QUOTE_NOT_ENGLISH"
  | "EMPTY_INFERENCE"
  | "EMPTY_ANSWER"
  | "CONFIDENCE_OUT_OF_RANGE"
  | "UNKNOWN_FIELD"
  | "MALFORMED_PAYLOAD"
  | "INVALID_THOUGHT_KIND"
  | "SOURCE_MISMATCH"
  | "EVIDENCE_MISMATCH"
  | "OPEN_QUESTION_REQUIRED";

export type GuardianResult =
  | { ok: true; candidate: CompanionProviderCandidate }
  | { ok: false; code: GuardianErrorCode; message: string };

const CJK_RE = /[\u4e00-\u9fff]/;
const ALLOWED_KEYS = new Set([
  "answer_zh",
  "quote_exact",
  "inference_zh",
  "thought_kind",
  "confidence",
  "open_question",
  "source_ids",
  "evidence_refs",
]);
const ALLOWED_THOUGHT_KINDS = new Set<string>([
  "inference",
  "experiment",
  "quote",
]);

/** Count non-overlapping occurrences of needle in haystack. */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle || typeof haystack !== "string" || typeof needle !== "string") {
    return 0;
  }
  let count = 0;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) break;
    count += 1;
    from = i + 1;
  }
  return count;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * Strict shape check before any trim/spread. Accepts unknown (provider may lie).
 */
export function validateCompanionCandidate(
  source: SourceDiscussionSnapshot | null | undefined,
  raw: unknown,
): GuardianResult {
  if (
    !source ||
    typeof source !== "object" ||
    typeof source.source_id !== "string" ||
    !source.source_id ||
    typeof source.quote !== "string" ||
    !source.quote
  ) {
    return {
      ok: false,
      code: "SOURCE_UNAVAILABLE",
      message: "active SourceBlock 不可用",
    };
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      code: "MALFORMED_PAYLOAD",
      message: "candidate 必须是对象",
    };
  }

  const obj = raw as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(k)) {
      return {
        ok: false,
        code: "UNKNOWN_FIELD",
        message: `未知字段: ${k}`,
      };
    }
  }

  if (typeof obj.answer_zh !== "string") {
    return {
      ok: false,
      code: "MALFORMED_PAYLOAD",
      message: "answer_zh 必须是 string",
    };
  }
  if (typeof obj.quote_exact !== "string") {
    return {
      ok: false,
      code: "MALFORMED_PAYLOAD",
      message: "quote_exact 必须是 string",
    };
  }
  if (typeof obj.inference_zh !== "string") {
    return {
      ok: false,
      code: "MALFORMED_PAYLOAD",
      message: "inference_zh 必须是 string",
    };
  }
  if (
    typeof obj.thought_kind !== "string" ||
    !ALLOWED_THOUGHT_KINDS.has(obj.thought_kind)
  ) {
    return {
      ok: false,
      code: "INVALID_THOUGHT_KIND",
      message: "thought_kind 必须是 inference|experiment|quote",
    };
  }
  if (typeof obj.confidence !== "number" || Number.isNaN(obj.confidence)) {
    return {
      ok: false,
      code: "CONFIDENCE_OUT_OF_RANGE",
      message: "confidence 必须是 number",
    };
  }
  if (
    obj.open_question !== null &&
    obj.open_question !== undefined &&
    typeof obj.open_question !== "string"
  ) {
    return {
      ok: false,
      code: "MALFORMED_PAYLOAD",
      message: "open_question 必须是 string 或 null",
    };
  }
  if (!isStringArray(obj.source_ids) || obj.source_ids.length === 0) {
    return {
      ok: false,
      code: "MALFORMED_PAYLOAD",
      message: "source_ids 必须是非空 string[]",
    };
  }
  if (!isStringArray(obj.evidence_refs)) {
    return {
      ok: false,
      code: "MALFORMED_PAYLOAD",
      message: "evidence_refs 必须是 string[]",
    };
  }

  // Now safe to trim
  const answer_zh = obj.answer_zh.trim();
  const quote = obj.quote_exact.trim();
  const inference_zh = obj.inference_zh.trim();
  const open_question =
    typeof obj.open_question === "string"
      ? obj.open_question.trim() || null
      : null;
  const thought_kind = obj.thought_kind as ThoughtKind;
  const confidence = obj.confidence;
  const source_ids = [...obj.source_ids];
  const evidence_refs = [...obj.evidence_refs];

  if (!answer_zh) {
    return {
      ok: false,
      code: "EMPTY_ANSWER",
      message: "answer_zh 不能为空",
    };
  }

  // F38: exact single active source — multi / extra / order spoof all fail.
  if (source_ids.length !== 1 || source_ids[0] !== source.source_id) {
    return {
      ok: false,
      code: "SOURCE_MISMATCH",
      message: "source_ids 必须精确等于 [active SourceBlock source_id]",
    };
  }

  if (!Array.isArray(source.evidence_refs)) {
    return {
      ok: false,
      code: "SOURCE_EVIDENCE_DRIFT",
      message: "source evidence_refs 不可用",
    };
  }

  const want = [...source.evidence_refs].sort().join("|");
  const got = [...evidence_refs].sort().join("|");
  if (want !== got) {
    return {
      ok: false,
      code: "EVIDENCE_MISMATCH",
      message: "candidate evidence_refs 与 sealed SourceEvidence 不一致",
    };
  }

  if (!quote) {
    return {
      ok: false,
      code: "QUOTE_NOT_FOUND",
      message: "quote_exact 为空",
    };
  }
  if (CJK_RE.test(quote)) {
    return {
      ok: false,
      code: "QUOTE_NOT_ENGLISH",
      message: "quote 不得含中文改写",
    };
  }

  const n = countOccurrences(source.quote, quote);
  if (n === 0) {
    return {
      ok: false,
      code: "QUOTE_NOT_FOUND",
      message: "quote_exact 不是当前 SourceBlock.quote 的连续子串",
    };
  }
  if (n > 1) {
    return {
      ok: false,
      code: "QUOTE_NOT_UNIQUE",
      message: "quote_exact 在原文中出现多次，无法唯一定位",
    };
  }

  if (!inference_zh) {
    return {
      ok: false,
      code: "EMPTY_INFERENCE",
      message: "inference_zh 不能为空",
    };
  }

  if (confidence < 0 || confidence > 1) {
    return {
      ok: false,
      code: "CONFIDENCE_OUT_OF_RANGE",
      message: "confidence 必须在 0..1",
    };
  }

  if (confidence < 0.9 && !open_question) {
    return {
      ok: false,
      code: "OPEN_QUESTION_REQUIRED",
      message: "推断置信度不足时 open_question 必填",
    };
  }

  return {
    ok: true,
    candidate: {
      answer_zh,
      quote_exact: quote,
      inference_zh,
      thought_kind,
      confidence,
      open_question,
      source_ids,
      evidence_refs,
    },
  };
}

export type BookThoughtReviseResult =
  | {
      ok: true;
      inference_zh: string;
      confidence: number;
      open_question: string | null;
      thought_kind: ThoughtKind;
    }
  | { ok: false; code: GuardianErrorCode; message: string };

/**
 * Validate revise payload against frozen thought identity (source/evidence).
 * Does not re-check quote uniqueness (revise only changes inference text).
 * Accepts unknown — null/array/non-object never throw (F38 fail-closed).
 */
export function validateBookThoughtRevise(
  input: unknown,
): BookThoughtReviseResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      code: "MALFORMED_PAYLOAD",
      message: "revise payload 必须是对象",
    };
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.inference_zh !== "string") {
    return {
      ok: false,
      code: "MALFORMED_PAYLOAD",
      message: "inference_zh 必须是 string",
    };
  }
  const inference_zh = obj.inference_zh.trim();
  if (!inference_zh) {
    return {
      ok: false,
      code: "EMPTY_INFERENCE",
      message: "inference_zh 不能为空",
    };
  }
  if (
    typeof obj.confidence !== "number" ||
    Number.isNaN(obj.confidence) ||
    obj.confidence < 0 ||
    obj.confidence > 1
  ) {
    return {
      ok: false,
      code: "CONFIDENCE_OUT_OF_RANGE",
      message: "confidence 必须在 0..1",
    };
  }
  if (
    obj.open_question !== null &&
    obj.open_question !== undefined &&
    typeof obj.open_question !== "string"
  ) {
    return {
      ok: false,
      code: "MALFORMED_PAYLOAD",
      message: "open_question 必须是 string 或 null",
    };
  }
  const open_question =
    typeof obj.open_question === "string"
      ? obj.open_question.trim() || null
      : null;
  if (
    typeof obj.thought_kind !== "string" ||
    !ALLOWED_THOUGHT_KINDS.has(obj.thought_kind)
  ) {
    return {
      ok: false,
      code: "INVALID_THOUGHT_KIND",
      message: "thought_kind 必须是 inference|experiment|quote",
    };
  }
  if (obj.confidence < 0.9 && !open_question) {
    return {
      ok: false,
      code: "OPEN_QUESTION_REQUIRED",
      message: "推断置信度不足时 open_question 必填",
    };
  }
  return {
    ok: true,
    inference_zh,
    confidence: obj.confidence,
    open_question,
    thought_kind: obj.thought_kind as ThoughtKind,
  };
}
