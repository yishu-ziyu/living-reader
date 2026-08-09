function normalizeInvitationQuestion(question: string): string {
  return question.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("zh-CN");
}

/** Stable session key only; it grants no permission to enter or compile a world. */
export function deriveInvitationQuestionKey(
  experience_id: string,
  trigger_question: string,
): string {
  return `agent-invitation:${JSON.stringify([
    experience_id.trim(),
    normalizeInvitationQuestion(trigger_question),
  ])}`;
}

export function hasInvitedQuestion(
  prior_question_keys: readonly string[],
  experience_id: string,
  trigger_question: string,
): boolean {
  return prior_question_keys.includes(
    deriveInvitationQuestionKey(experience_id, trigger_question),
  );
}
