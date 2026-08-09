import { describe, expect, it } from "vitest";
import {
  deriveInvitationQuestionKey,
  handleAgentTurn,
  type AgentTurnCandidate,
  type AgentTurnInput,
  type AgentTurnPorts,
  type PendingIntent,
  type WorldBasis,
} from "@/modules/agent-os";

const basis: WorldBasis = {
  experience_id: "exp_wool_1",
  world_id: "world_wool_1",
  graph_revision: 1,
  world_revision: 0,
  ruleset_id: "wool-town-v1",
};

function input(overrides: Partial<AgentTurnInput> = {}): AgentTurnInput {
  return {
    turn_id: "turn-001",
    channel: "text",
    final_text: "修条路，把货卖到隔壁城去",
    source_snapshot_id: "snapshot-45",
    active_source_ids: ["smith.b1.c3.market_extent"],
    world_basis: basis,
    invitation_basis: null,
    recent_turns: [],
    pending_intent: null,
    ...overrides,
  };
}

function pending(overrides: Partial<PendingIntent> = {}): PendingIntent {
  return {
    action_id: "expand_market",
    topic_key: "market_access",
    origin_turn_id: "turn-hypothesis",
    source_snapshot_id: "snapshot-45",
    source_ids: ["smith.b1.c3.market_extent"],
    basis,
    ...overrides,
  };
}

const expandMarket: AgentTurnCandidate = {
  mode: "act",
  intent_class: "executable_action",
  relevance: "mechanism_adjacent",
  confidence: "high",
  target_source_ids: ["smith.b1.c3.market_extent"],
  evidence_refs: ["pdf:45"],
  companion_line: "好，路往隔壁城铺。",
  proposed_action_id: "expand_market",
  reason_codes: ["clear_allowlisted_action"],
};

const inviteMarketWorld: AgentTurnCandidate = {
  mode: "invite_world",
  intent_class: "source_question",
  relevance: "directly_anchored",
  confidence: "high",
  target_source_ids: ["smith.b1.c3.p1"],
  evidence_refs: [],
  companion_line: "这道问题已经有一座小世界可以试试看。",
  recipe_id: "smith.b1.market-extent.v1",
  trigger_question: "市场大小为什么会限制分工？",
  reason: "已审配方能检验当前关系。",
  reason_codes: ["reviewed_recipe_match"],
};

describe("T009 AgentTurn", () => {
  it("direct act: validates a provider candidate and commits exactly one allowlisted command", async () => {
    const dispatched: Array<{
      turn_id: string;
      action: string;
      idempotency_key: string;
    }> = [];
    let providerCalls = 0;
    const ports: AgentTurnPorts = {
      provider: {
        decide: async () => {
          providerCalls += 1;
          return expandMarket;
        },
      },
      dispatch: async ({ turn_id, command, idempotency_key }) => {
        dispatched.push({ turn_id, action: command.action, idempotency_key });
        return {
          ok: true,
          committed: true,
          duplicate: false,
          code: "OK",
          world_revision: 1,
          event_count: 4,
        };
      },
    };

    const result = await handleAgentTurn(input(), ports);

    expect(result.mode).toBe("act");
    expect(result.command).toEqual({
      action: "expand_market",
      experience_id: basis.experience_id,
      world_id: basis.world_id,
      graph_revision: basis.graph_revision,
      expected_world_revision: basis.world_revision,
      ruleset_id: basis.ruleset_id,
    });
    expect(result.dispatch_receipt).toMatchObject({
      committed: true,
      event_count: 4,
      world_revision: 1,
    });
    expect(result.pending_intent_next).toBeNull();
    expect(result.zero_world_mutation).toBe(false);
    expect(result.companion_line).toBe("好，路往隔壁城铺。");
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.turn_id).toBe("turn-001");
    expect(providerCalls).toBe(1);
    expect(dispatched[0]?.action).toBe("expand_market");
    expect(dispatched[0]?.idempotency_key).toContain("turn-001");
    expect(dispatched[0]?.idempotency_key).toContain("expand_market");
  });

  it("hypothetical → unique follow-up: keeps the first world untouched, then commits once", async () => {
    const candidates: AgentTurnCandidate[] = [
      {
        ...expandMarket,
        mode: "discuss",
        intent_class: "productive_detour",
        companion_line: "嚯，你这是惦记上隔壁城了。",
        proposed_action_id: undefined,
        pending_action_id: "expand_market",
      },
      {
        ...expandMarket,
        proposed_action_id: undefined,
        companion_line: "行，开工。",
      },
    ];
    let kernelCalls = 0;
    const ports: AgentTurnPorts = {
      provider: {
        decide: async () => candidates.shift(),
      },
      dispatch: async () => {
        kernelCalls += 1;
        return {
          ok: true,
          committed: true,
          duplicate: false,
          code: "OK",
          world_revision: 1,
          event_count: 4,
        };
      },
    };

    const first = await handleAgentTurn(
      input({
        turn_id: "turn-hypothesis",
        final_text: "要是能修条路通到隔壁城就好了",
      }),
      ports,
    );

    expect(first.mode).toBe("discuss");
    expect(first.pending_intent_next).toMatchObject({
      action_id: "expand_market",
      source_snapshot_id: "snapshot-45",
      basis,
    });
    expect(first.command).toBeNull();
    expect(first.dispatch_receipt).toBeNull();
    expect(first.zero_world_mutation).toBe(true);
    expect(kernelCalls).toBe(0);

    const followUp = await handleAgentTurn(
      input({
        turn_id: "turn-follow-up",
        final_text: "那就修",
        pending_intent: first.pending_intent_next,
      }),
      ports,
    );

    expect(followUp.mode).toBe("act");
    expect(followUp.command?.action).toBe("expand_market");
    expect(followUp.pending_intent_next).toBeNull();
    expect(followUp.dispatch_receipt?.committed).toBe(true);
    expect(kernelCalls).toBe(1);
  });

  it("isolated follow-up never guesses an action or changes the world", async () => {
    let kernelCalls = 0;
    const ports: AgentTurnPorts = {
      provider: {
        decide: async () => ({
          ...expandMarket,
          proposed_action_id: undefined,
          companion_line: "修哪条？我还没接上你的上一句。",
        }),
      },
      dispatch: async () => {
        kernelCalls += 1;
        return {
          ok: true,
          committed: true,
          duplicate: false,
          code: "OK",
          world_revision: 1,
          event_count: 4,
        };
      },
    };

    const result = await handleAgentTurn(
      input({
        turn_id: "turn-isolated-follow-up",
        final_text: "那就修",
      }),
      ports,
    );

    expect(result.mode).toBe("clarify");
    expect(result.command).toBeNull();
    expect(result.pending_intent_next).toBeNull();
    expect(result.zero_world_mutation).toBe(true);
    expect(kernelCalls).toBe(0);
  });

  it("invalidates a pending action when its sealed source or world basis no longer matches", async () => {
    const staleInputs: Array<{ name: string; turn: AgentTurnInput }> = [
      {
        name: "source snapshot",
        turn: input({
          source_snapshot_id: "snapshot-36",
          active_source_ids: ["smith.b1.c1.division"],
          pending_intent: pending(),
        }),
      },
      {
        name: "experience identity",
        turn: input({
          world_basis: { ...basis, experience_id: "exp_other" },
          pending_intent: pending(),
        }),
      },
      {
        name: "world identity",
        turn: input({
          world_basis: { ...basis, world_id: "world_other" },
          pending_intent: pending(),
        }),
      },
      {
        name: "graph revision",
        turn: input({
          world_basis: { ...basis, graph_revision: 2 },
          pending_intent: pending(),
        }),
      },
      {
        name: "world revision",
        turn: input({
          world_basis: { ...basis, world_revision: 1 },
          pending_intent: pending(),
        }),
      },
      {
        name: "ruleset",
        turn: input({
          world_basis: { ...basis, ruleset_id: "ruleset-other" },
          pending_intent: pending(),
        }),
      },
    ];
    let kernelCalls = 0;
    const ports: AgentTurnPorts = {
      provider: {
        decide: async () => ({
          ...expandMarket,
          mode: "clarify",
          proposed_action_id: undefined,
        }),
      },
      dispatch: async () => {
        kernelCalls += 1;
        return {
          ok: true,
          committed: true,
          duplicate: false,
          code: "OK",
          world_revision: 1,
          event_count: 4,
        };
      },
    };

    for (const { name, turn } of staleInputs) {
      const result = await handleAgentTurn(turn, ports);
      expect({ name, pending: result.pending_intent_next, command: result.command }).toEqual({
        name,
        pending: null,
        command: null,
      });
      expect(result.zero_world_mutation).toBe(true);
    }
    expect(kernelCalls).toBe(0);
  });

  it("stop and competing or unrelated intent invalidate the old pending action without dispatch", async () => {
    let providerCalls = 0;
    let kernelCalls = 0;
    const ports: AgentTurnPorts = {
      provider: {
        decide: async () => {
          providerCalls += 1;
          if (providerCalls === 1) {
            return {
              ...expandMarket,
              mode: "discuss",
              intent_class: "productive_detour",
              pending_action_id: "deepen_specialization",
              proposed_action_id: undefined,
              companion_line: "那就换一件事想想。",
            };
          }
          return {
            ...expandMarket,
            mode: "discuss",
            intent_class: "obvious_off_topic_noise",
            relevance: "none",
            proposed_action_id: undefined,
            companion_line: "这句先没接到当前世界。",
          };
        },
      },
      dispatch: async () => {
        kernelCalls += 1;
        return {
          ok: true,
          committed: true,
          duplicate: false,
          code: "OK",
          world_revision: 1,
          event_count: 4,
        };
      },
    };

    const stopped = await handleAgentTurn(
      input({ final_text: "停止", pending_intent: pending() }),
      ports,
    );
    expect(stopped.mode).toBe("stop");
    expect(stopped.pending_intent_next).toBeNull();
    expect(providerCalls).toBe(0);

    const competing = await handleAgentTurn(
      input({ turn_id: "turn-competing", pending_intent: pending() }),
      ports,
    );
    expect(competing.pending_intent_next).toMatchObject({
      action_id: "deepen_specialization",
      origin_turn_id: "turn-competing",
    });

    const unrelated = await handleAgentTurn(
      input({ turn_id: "turn-unrelated", pending_intent: pending() }),
      ports,
    );
    expect(unrelated.pending_intent_next).toBeNull();
    expect(kernelCalls).toBe(0);
  });

  it("duplicate final keeps the same derived key and receives the original committed receipt", async () => {
    const receipts = new Map<string, { world_revision: number; event_count: number }>();
    let kernelCalls = 0;
    const ports: AgentTurnPorts = {
      provider: { decide: async () => expandMarket },
      dispatch: async ({ idempotency_key }) => {
        const existing = receipts.get(idempotency_key);
        if (existing) {
          return {
            ok: true,
            committed: true,
            duplicate: true,
            code: "OK",
            ...existing,
          };
        }
        kernelCalls += 1;
        const receipt = { world_revision: 1, event_count: 4 };
        receipts.set(idempotency_key, receipt);
        return {
          ok: true,
          committed: true,
          duplicate: false,
          code: "OK",
          ...receipt,
        };
      },
    };

    const first = await handleAgentTurn(input({ turn_id: "turn-duplicate" }), ports);
    const retry = await handleAgentTurn(input({ turn_id: "turn-duplicate" }), ports);

    expect(first.idempotency_key).toBe(retry.idempotency_key);
    expect(first.dispatch_receipt).toMatchObject({ duplicate: false, event_count: 4 });
    expect(retry.dispatch_receipt).toMatchObject({ duplicate: true, event_count: 4 });
    expect(retry.zero_world_mutation).toBe(true);
    expect(kernelCalls).toBe(1);
  });

  it("low-confidence Candidate and temporary provider failure preserve a valid pending action", async () => {
    const originalPending = pending();
    let kernelCalls = 0;
    const lowConfidencePorts: AgentTurnPorts = {
      provider: {
        decide: async () => ({ ...expandMarket, confidence: "low" }),
      },
      dispatch: async () => {
        kernelCalls += 1;
        return {
          ok: true,
          committed: true,
          duplicate: false,
          code: "OK",
          world_revision: 1,
          event_count: 4,
        };
      },
    };
    const temporaryFailurePorts: AgentTurnPorts = {
      provider: {
        decide: async () => {
          throw new Error("temporary provider outage");
        },
      },
      dispatch: lowConfidencePorts.dispatch,
    };

    const lowConfidence = await handleAgentTurn(
      input({ turn_id: "turn-low-confidence", pending_intent: originalPending }),
      lowConfidencePorts,
    );
    const temporaryFailure = await handleAgentTurn(
      input({ turn_id: "turn-provider-retry", pending_intent: originalPending }),
      temporaryFailurePorts,
    );

    expect(lowConfidence.mode).toBe("clarify");
    expect(lowConfidence.pending_intent_next).toEqual(originalPending);
    expect(temporaryFailure.mode).toBe("clarify");
    expect(temporaryFailure.pending_intent_next).toEqual(originalPending);
    expect(kernelCalls).toBe(0);
  });

  it("proven stale or unsupported dispatch failures clear the pending action without a completion claim", async () => {
    const codes = [
      "EXPECTED_WORLD_REVISION_MISMATCH",
      "ACTION_UNSUPPORTED",
    ] as const;
    for (const code of codes) {
      const ports: AgentTurnPorts = {
        provider: {
          decide: async () => ({ ...expandMarket, proposed_action_id: undefined }),
        },
        dispatch: async () => ({
          ok: false,
          committed: false,
          duplicate: false,
          code,
          world_revision: null,
          event_count: 0,
        }),
      };

      const result = await handleAgentTurn(
        input({
          turn_id: `turn-${code}`,
          final_text: "那就修",
          pending_intent: pending(),
        }),
        ports,
      );

      expect(result.mode).toBe("clarify");
      expect(result.pending_intent_next).toBeNull();
      expect(result.dispatch_receipt).toMatchObject({ code, committed: false });
      expect(result.companion_line).not.toBe(expandMarket.companion_line);
      expect(result.zero_world_mutation).toBe(true);
    }
  });

  it("fails closed when the provider proposes an action outside the frozen allowlist", async () => {
    let kernelCalls = 0;
    const ports: AgentTurnPorts = {
      provider: {
        decide: async () => ({
          ...expandMarket,
          proposed_action_id: "constrain_market",
        }),
      },
      dispatch: async () => {
        kernelCalls += 1;
        return {
          ok: true,
          committed: true,
          duplicate: false,
          code: "OK",
          world_revision: 1,
          event_count: 4,
        };
      },
    };

    const result = await handleAgentTurn(
      input({ pending_intent: pending() }),
      ports,
    );

    expect(result.mode).toBe("clarify");
    expect(result.pending_intent_next).toEqual(pending());
    expect(result.command).toBeNull();
    expect(kernelCalls).toBe(0);
  });

  it("does not execute a hypothetical candidate merely because the provider marks it act", async () => {
    let kernelCalls = 0;
    const result = await handleAgentTurn(input(), {
      provider: {
        decide: async () => ({
          ...expandMarket,
          intent_class: "productive_detour",
        }),
      },
      dispatch: async () => {
        kernelCalls += 1;
        throw new Error("hypothetical candidate must not dispatch");
      },
    });

    expect(result.mode).toBe("clarify");
    expect(result.command).toBeNull();
    expect(result.zero_world_mutation).toBe(true);
    expect(kernelCalls).toBe(0);
  });

  it("does not expose a completion acknowledgement until the app receipt proves a committed world event", async () => {
    const ports: AgentTurnPorts = {
      provider: { decide: async () => expandMarket },
      dispatch: async () => ({
        ok: true,
        committed: true,
        duplicate: false,
        code: "OK",
        world_revision: null,
        event_count: 0,
      }),
    };

    const result = await handleAgentTurn(input({ turn_id: "turn-incomplete-receipt" }), ports);

    expect(result.mode).toBe("clarify");
    expect(result.zero_world_mutation).toBe(true);
    expect(result.companion_line).not.toBe(expandMarket.companion_line);
  });

  it("text and final voice normalize to the same semantic action, basis and acknowledgement", async () => {
    const receipts = new Set<string>();
    const ports: AgentTurnPorts = {
      provider: { decide: async () => expandMarket },
      dispatch: async ({ idempotency_key }) => {
        const duplicate = receipts.has(idempotency_key);
        receipts.add(idempotency_key);
        return {
          ok: true,
          committed: true,
          duplicate,
          code: "OK",
          world_revision: 1,
          event_count: 4,
        };
      },
    };
    const shared = {
      turn_id: "turn-text-voice-equivalent",
      final_text: "修条路，把货卖到隔壁城去",
    };

    const text = await handleAgentTurn(
      input({ ...shared, channel: "text" }),
      ports,
    );
    const voice = await handleAgentTurn(
      input({ ...shared, channel: "voice", asr_confidence: 0.95 }),
      ports,
    );

    expect({
      mode: text.mode,
      command: text.command,
      basis: text.command && {
        experience_id: text.command.experience_id,
        world_id: text.command.world_id,
        graph_revision: text.command.graph_revision,
        world_revision: text.command.expected_world_revision,
        ruleset_id: text.command.ruleset_id,
      },
      idempotency_key: text.idempotency_key,
      companion_line: text.companion_line,
    }).toEqual({
      mode: voice.mode,
      command: voice.command,
      basis: voice.command && {
        experience_id: voice.command.experience_id,
        world_id: voice.command.world_id,
        graph_revision: voice.command.graph_revision,
        world_revision: voice.command.expected_world_revision,
        ruleset_id: voice.command.ruleset_id,
      },
      idempotency_key: voice.idempotency_key,
      companion_line: voice.companion_line,
    });
    expect(voice.dispatch_receipt?.duplicate).toBe(true);
  });

  it("passes only the last four final visible turns to the single semantic provider call", async () => {
    let receivedTurnIds: string[] = [];
    const ports: AgentTurnPorts = {
      provider: {
        decide: async (request) => {
          receivedTurnIds = request.recent_turns.map((turn) => turn.turn_id);
          return {
            ...expandMarket,
            mode: "discuss",
            intent_class: "source_question",
            proposed_action_id: undefined,
            companion_line: "我们沿着这段原文再看一眼。",
          };
        },
      },
      dispatch: async () => {
        throw new Error("discussion must not dispatch");
      },
    };

    await handleAgentTurn(
      input({
        recent_turns: [
          { turn_id: "turn-1", role: "reader", visible_text: "一" },
          { turn_id: "turn-2", role: "companion", visible_text: "二" },
          { turn_id: "turn-3", role: "reader", visible_text: "三" },
          { turn_id: "turn-4", role: "companion", visible_text: "四" },
          { turn_id: "turn-5", role: "reader", visible_text: "五" },
          { turn_id: "turn-6", role: "companion", visible_text: "六" },
        ],
      }),
      ports,
    );

    expect(receivedTurnIds).toEqual(["turn-3", "turn-4", "turn-5", "turn-6"]);
  });

  it("passes a cloned invitation basis and bounded relationship context to the provider", async () => {
    const invitationBasis = {
      experience_id: "exp-reading",
      graph_revision: 2,
      relation_id: "relation-market",
      relation_basis_revision: 1,
      accepted_relation_ids: ["relation-market"],
      source_snapshot_id: "snapshot-45",
    } as const;
    const relationshipContext = {
      current_chapter_id: "smith.b1.c3",
      memories: [
        {
          memory_id: "memory-1",
          kind: "confusion" as const,
          origin: "agent_observed" as const,
          text: "读者仍在比较市场范围与分工深度。",
          source_locator: "smith.b1.c3.market_extent",
          reader_idea_id: null,
        },
      ],
      active_recipe_ids: ["wealth-of-nations.market-extent.v1"],
    };
    let received: unknown;

    await handleAgentTurn(
      input({
        invitation_basis: invitationBasis,
        relationship_context: relationshipContext,
      }),
      {
        provider: {
          decide: async (request) => {
            received = request;
            return {
              ...expandMarket,
              mode: "discuss",
              intent_class: "source_question",
              proposed_action_id: undefined,
            };
          },
        },
        dispatch: async () => {
          throw new Error("discussion must not dispatch");
        },
      },
    );

    expect(received).toMatchObject({
      invitation_basis: invitationBasis,
      relationship_context: relationshipContext,
    });
    expect(received).not.toBe(invitationBasis);
  });

  it("returns a source-grounded invitation without dispatching or accepting it", async () => {
    const invitationBasis = {
      experience_id: "exp-reading",
      graph_revision: 2,
      relation_id: "relation-market",
      relation_basis_revision: 1,
      accepted_relation_ids: ["relation-market"],
      source_snapshot_id: "smith.b1.c3.p1:hash-current",
    } as const;
    let dispatchCalls = 0;

    const result = await handleAgentTurn(
      input({
        final_text: inviteMarketWorld.trigger_question,
        source_snapshot_id: invitationBasis.source_snapshot_id,
        active_source_ids: ["smith.b1.c3.p1"],
        world_basis: null,
        invitation_basis: invitationBasis,
      }),
      {
        provider: { decide: async () => inviteMarketWorld },
        dispatch: async () => {
          dispatchCalls += 1;
          throw new Error("an invitation must never dispatch or accept a world");
        },
      },
    );

    expect(result.mode).toBe("invite_world");
    expect(result.invitation).toEqual({
      recipe_id: "smith.b1.market-extent.v1",
      trigger_question: "市场大小为什么会限制分工？",
      reason: "已审配方能检验当前关系。",
      question_key: deriveInvitationQuestionKey(
        "exp-reading",
        "市场大小为什么会限制分工？",
      ),
      basis: invitationBasis,
    });
    expect(result.invitation?.basis).not.toBe(invitationBasis);
    expect(result.invitation?.basis.accepted_relation_ids).not.toBe(
      invitationBasis.accepted_relation_ids,
    );
    expect(result.command).toBeNull();
    expect(result.zero_world_mutation).toBe(true);
    expect(dispatchCalls).toBe(0);
  });

  it("fails closed when an invitation recipe or its source/relation basis is not current", async () => {
    const validBasis = {
      experience_id: "exp-reading",
      graph_revision: 2,
      relation_id: "relation-market",
      relation_basis_revision: 1,
      accepted_relation_ids: ["relation-market"],
      source_snapshot_id: "smith.b1.c3.p1:hash-current",
    } as const;
    const cases: Array<{
      name: string;
      turn: AgentTurnInput;
      candidate?: AgentTurnCandidate;
    }> = [
      {
        name: "recipe missing from reviewed catalog",
        turn: input({
          source_snapshot_id: validBasis.source_snapshot_id,
          active_source_ids: ["smith.b1.c3.p1"],
          world_basis: null,
          invitation_basis: validBasis,
        }),
        candidate: { ...inviteMarketWorld, recipe_id: "invented-recipe" },
      },
      {
        name: "reviewed recipe belongs to another canonical source",
        turn: input({
          source_snapshot_id: validBasis.source_snapshot_id,
          active_source_ids: ["smith.b1.c3.p1"],
          world_basis: null,
          invitation_basis: validBasis,
        }),
        candidate: {
          ...inviteMarketWorld,
          recipe_id: "smith.b1.division-deepening.v1",
        },
      },
      {
        name: "basis absent",
        turn: input({
          source_snapshot_id: validBasis.source_snapshot_id,
          active_source_ids: ["smith.b1.c3.p1"],
          world_basis: null,
          invitation_basis: null,
        }),
      },
      {
        name: "graph not committed",
        turn: input({
          source_snapshot_id: validBasis.source_snapshot_id,
          active_source_ids: ["smith.b1.c3.p1"],
          world_basis: null,
          invitation_basis: { ...validBasis, graph_revision: 0 },
        }),
      },
      {
        name: "relation not accepted",
        turn: input({
          source_snapshot_id: validBasis.source_snapshot_id,
          active_source_ids: ["smith.b1.c3.p1"],
          world_basis: null,
          invitation_basis: { ...validBasis, accepted_relation_ids: [] },
        }),
      },
      {
        name: "source snapshot stale",
        turn: input({
          source_snapshot_id: validBasis.source_snapshot_id,
          active_source_ids: ["smith.b1.c3.p1"],
          world_basis: null,
          invitation_basis: {
            ...validBasis,
            source_snapshot_id: "smith.b1.c3.p1:hash-stale",
          },
        }),
      },
    ];
    let dispatchCalls = 0;

    for (const testCase of cases) {
      const result = await handleAgentTurn(testCase.turn, {
        provider: { decide: async () => testCase.candidate ?? inviteMarketWorld },
        dispatch: async () => {
          dispatchCalls += 1;
          throw new Error("invalid invitation must not dispatch");
        },
      });
      expect({ name: testCase.name, mode: result.mode, invitation: result.invitation })
        .toEqual({
          name: testCase.name,
          mode: "clarify",
          invitation: null,
        });
      expect(result.zero_world_mutation).toBe(true);
    }
    expect(dispatchCalls).toBe(0);
  });
});
