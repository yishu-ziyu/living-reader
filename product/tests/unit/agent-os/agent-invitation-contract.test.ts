import { describe, expect, it } from "vitest";
import {
  deriveAgentTurnSourceSnapshotId,
  parseAgentTurnCandidate,
  parseAgentTurnProviderInput,
  parseStrictAgentTurnCandidate,
} from "@/modules/agent-os/provider";
import {
  deriveInvitationQuestionKey,
  hasInvitedQuestion,
  type AgentTurnProviderInput,
  type InvitationBasis,
  type RelationshipContext,
} from "@/modules/agent-os/turn";

const sourceId = "smith.b1.c3.p1";
const snapshotId = deriveAgentTurnSourceSnapshotId(sourceId, "source-hash");

const invitationBasis: InvitationBasis = {
  experience_id: "experience-1",
  graph_revision: 3,
  relation_id: "relation-market-extent",
  relation_basis_revision: 2,
  accepted_relation_ids: ["relation-market-extent"],
  source_snapshot_id: snapshotId,
};

const relationshipContext: RelationshipContext = {
  current_chapter_id: "smith.b1.c3",
  memories: [
    {
      memory_id: "memory-1",
      kind: "discussion_theme",
      origin: "agent_observed",
      text: "读者仍在比较市场范围与分工深度。",
      source_locator: sourceId,
      reader_idea_id: null,
    },
  ],
  active_recipe_ids: ["wealth-of-nations.market-extent.v1"],
  invited_question_keys: [],
};

function providerInput(
  overrides: Partial<AgentTurnProviderInput> = {},
): AgentTurnProviderInput {
  return {
    turn_id: "turn-invite-1",
    channel: "text",
    final_text: "市场大小为什么会限制分工？",
    source_snapshot_id: snapshotId,
    active_source_ids: [sourceId],
    world_basis: null,
    invitation_basis: invitationBasis,
    recent_turns: [],
    invited_question_keys: [],
    pending_intent: null,
    relationship_context: relationshipContext,
    ...overrides,
  };
}

function strictInviteCandidate() {
  return {
    mode: "invite_world",
    intent_class: "source_question",
    relevance: "directly_anchored",
    confidence: "high",
    target_source_ids: [sourceId],
    evidence_refs: [],
    open_question: null,
    companion_line: "这道问题已经有一座小世界可以试试看。",
    proposed_action_id: null,
    pending_action_id: null,
    recipe_id: "wealth-of-nations.market-extent.v1",
    trigger_question: "市场大小为什么会限制分工？",
    reason: "已审配方能直接检验当前关系。",
    reason_codes: ["reviewed_recipe_match"],
  };
}

describe("T053 Agent invitation contracts", () => {
  it("preserves a bounded relationship context without changing memory origin", () => {
    expect(parseAgentTurnProviderInput(providerInput())).toEqual(providerInput());

    expect(
      parseAgentTurnProviderInput({
        ...providerInput(),
        relationship_context: {
          ...relationshipContext,
          memories: [
            {
              ...relationshipContext.memories[0],
              origin: "agent_observed",
              extra: "must fail closed",
            },
          ],
        },
      }),
    ).toBeNull();
    expect(
      parseAgentTurnProviderInput({
        ...providerInput(),
        relationship_context: {
          ...relationshipContext,
          memories: Array.from({ length: 13 }, (_, index) => ({
            ...relationshipContext.memories[0],
            memory_id: `memory-${index}`,
          })),
        },
      }),
    ).toBeNull();
    expect(
      parseAgentTurnProviderInput({
        ...providerInput(),
        relationship_context: {
          ...relationshipContext,
          memories: [
            {
              ...relationshipContext.memories[0],
              text: "x".repeat(241),
            },
          ],
        },
      }),
    ).toBeNull();
  });

  it("requires invitation_basis at the HTTP/provider boundary while old context remains optional", () => {
    const withoutContext = structuredClone(providerInput());
    Reflect.deleteProperty(withoutContext, "relationship_context");
    expect(parseAgentTurnProviderInput(withoutContext)).toEqual(withoutContext);

    const withoutInvitationBasis = structuredClone(providerInput());
    Reflect.deleteProperty(withoutInvitationBasis, "invitation_basis");
    expect(parseAgentTurnProviderInput(withoutInvitationBasis)).toBeNull();
    expect(
      parseAgentTurnProviderInput({
        ...providerInput(),
        invitation_basis: { ...invitationBasis, extra: true },
      }),
    ).toBeNull();
  });

  it("accepts invite_world only with its exact strict fields and keeps legacy candidates compatible", () => {
    expect(parseStrictAgentTurnCandidate(strictInviteCandidate())).toMatchObject({
      mode: "invite_world",
      recipe_id: "wealth-of-nations.market-extent.v1",
    });
    expect(
      parseStrictAgentTurnCandidate({
        ...strictInviteCandidate(),
        reason: null,
      }),
    ).toBeNull();

    const legacyCandidate = {
      ...strictInviteCandidate(),
      mode: "discuss",
    };
    Reflect.deleteProperty(legacyCandidate, "recipe_id");
    Reflect.deleteProperty(legacyCandidate, "trigger_question");
    Reflect.deleteProperty(legacyCandidate, "reason");
    expect(parseAgentTurnCandidate(legacyCandidate)).toMatchObject({
      mode: "discuss",
    });
    expect(parseStrictAgentTurnCandidate(legacyCandidate)).toBeNull();
  });

  it("derives a stable, experience-scoped key for session invitation deduplication", () => {
    const first = deriveInvitationQuestionKey(
      "experience-1",
      "  市场大小为什么会限制分工？ ",
    );
    const repeated = deriveInvitationQuestionKey(
      "experience-1",
      "市场大小为什么会限制分工？",
    );

    expect(first).toBe(repeated);
    expect(hasInvitedQuestion([first], "experience-1", "市场大小为什么会限制分工？"))
      .toBe(true);
    expect(hasInvitedQuestion([first], "experience-2", "市场大小为什么会限制分工？"))
      .toBe(false);
    expect(
      deriveInvitationQuestionKey("experience-1", "问".repeat(1_000)),
    ).toHaveLength(36);
  });
});
