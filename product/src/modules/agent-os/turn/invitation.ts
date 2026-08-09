function normalizeInvitationQuestion(question: string): string {
  return question.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("zh-CN");
}

const FNV32_OFFSET = 0x811c9dc5;
const FNV32_PRIME = 0x01000193;
const SECONDARY_OFFSET = 0x9e3779b9;
const SECONDARY_PRIME = 0x85ebca6b;

function stableQuestionDigest(value: string): string {
  let first = FNV32_OFFSET;
  let second = SECONDARY_OFFSET;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    first = Math.imul(first ^ codeUnit, FNV32_PRIME);
    second = Math.imul(second ^ codeUnit, SECONDARY_PRIME);
  }
  return [first, second]
    .map((part) => (part >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

/** Fixed-size dedup key from sealed reader text; it grants no world permission. */
export function deriveInvitationQuestionKey(
  experience_id: string,
  reader_question: string,
): string {
  const sealedQuestion = JSON.stringify([
    experience_id.trim(),
    normalizeInvitationQuestion(reader_question),
  ]);
  return `agent-invitation:v2:${stableQuestionDigest(sealedQuestion)}`;
}

export function hasInvitedQuestion(
  prior_question_keys: readonly string[],
  experience_id: string,
  reader_question: string,
): boolean {
  return prior_question_keys.includes(
    deriveInvitationQuestionKey(experience_id, reader_question),
  );
}
