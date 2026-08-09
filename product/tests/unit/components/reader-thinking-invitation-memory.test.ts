import { describe, expect, it } from "vitest";

import { persistInvitationQuestionKey } from "@/components/ReaderThinkingProvider";
import { storeErr, storeOk } from "@/modules/reader-world/event-store";
import { projectMemory } from "@/modules/reader-world/memory";

const EXPERIENCE_ID = "exp_invitation_session_memory";
const QUESTION_KEY = "agent-invitation:v2:0123456789abcdef";

describe("ReaderThinking invitation memory", () => {
  it("adds the session dedup key only after durable persistence succeeds", async () => {
    const invitedQuestionKeys = new Set<string>();
    const failure = storeErr("STORE_UNAVAILABLE", "append failed");

    const failed = await persistInvitationQuestionKey(
      QUESTION_KEY,
      invitedQuestionKeys,
      async () => failure,
    );

    expect(failed).toBe(failure);
    expect(invitedQuestionKeys.has(QUESTION_KEY)).toBe(false);

    const success = storeOk(projectMemory(EXPERIENCE_ID, []));
    const persisted = await persistInvitationQuestionKey(
      QUESTION_KEY,
      invitedQuestionKeys,
      async () => success,
    );

    expect(persisted).toBe(success);
    expect(invitedQuestionKeys).toEqual(new Set([QUESTION_KEY]));
  });
});
