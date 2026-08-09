import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "@/infrastructure/event-store/memory";
import {
  createWorldDispatchPort,
  deriveWorldActionIdempotencyKey,
  type AgentWorldInvitation,
} from "@/modules/agent-os";
import {
  createReaderWorldUseCase,
  deriveWorldInvitationAcceptanceId,
} from "@/modules/reader-world/use-case";
import {
  asDomainEventDraft,
  createDomainEventDraft,
} from "@/modules/reader-world/events";

const EXPERIENCE_ID = "exp_reader_world_use_case";
const PRINCIPAL_ID = "reader_local";
const RECORDED_AT = "2026-08-09T18:00:00.000Z";

function canonicalMessageId(sequence: number): string {
  return `01K25V2J${String(sequence).padStart(18, "0")}`;
}

function draftFactory(
  input: Parameters<typeof createDomainEventDraft>[0],
) {
  return Promise.resolve(asDomainEventDraft(createDomainEventDraft(input)));
}

async function committedGraph(store: InMemoryEventStore) {
  const graph = createDomainEventDraft({
    message_name: "reader_world.graph.committed.v1",
    message_id: canonicalMessageId(1),
    experience_id: EXPERIENCE_ID,
    correlation_id: "corr_graph",
    causation_id: null,
    producer: { module: "test", instance: "reader-world-use-case" },
    security: {
      principal_id: PRINCIPAL_ID,
      authority: "reader",
      integrity: "local",
    },
    recorded_at: RECORDED_AT,
    payload: {
      graph_revision: 2,
      accepted_relation_ids: ["relation_division_market"],
      basis_graph_revision: 1,
    },
  });
  const appended = await store.append({
    experience_id: EXPERIENCE_ID,
    principal_id: PRINCIPAL_ID,
    idempotency_key: "graph-commit",
    expected_version: -1,
    events: [graph],
  });
  if (!appended.ok) throw appended.error;
}

async function committedLegacyWoolTown(store: InMemoryEventStore) {
  const seed = createDomainEventDraft({
    message_name: "reader_world.world.seeded.v1",
    message_id: "01K25V2J000000000000000010",
    experience_id: EXPERIENCE_ID,
    correlation_id: "corr_legacy_world_seed",
    causation_id: "msg_graph_committed",
    producer: { module: "reader_world", instance: "world-bootstrap-t010" },
    security: {
      principal_id: PRINCIPAL_ID,
      authority: "system",
      integrity: "local",
    },
    recorded_at: RECORDED_AT,
    payload: {
      world_id: "world_wool_town_g2",
      graph_revision: 2,
      seed: 42,
      ruleset_id: "wool-town-v1",
    },
  });
  const appended = await store.append({
    experience_id: EXPERIENCE_ID,
    principal_id: PRINCIPAL_ID,
    idempotency_key: "legacy-world-seed",
    expected_version: 1,
    events: [seed],
  });
  if (!appended.ok) throw appended.error;
}

function invitation(): AgentWorldInvitation {
  return {
    recipe_id: "smith.b1.division-deepening.v1",
    trigger_question: "如果市场继续扩大，分工会怎样？",
    reason: "把分工深化的因果链放进一个可操作世界。",
    question_key: "agent-invitation:test",
    basis: {
      experience_id: EXPERIENCE_ID,
      graph_revision: 2,
      relation_id: "relation_division_market",
      relation_basis_revision: 1,
      accepted_relation_ids: ["relation_division_market"],
      source_snapshot_id: "snapshot_division",
    },
  };
}

describe("ReaderWorldUseCase", () => {
  it("accepts a reviewed invitation through one seeded.v2 write and returns a deterministic presentation plan", async () => {
    const store = new InMemoryEventStore();
    await committedGraph(store);
    const useCase = createReaderWorldUseCase({
      store,
      principal_id: PRINCIPAL_ID,
      draft_factory: draftFactory,
    });

    const accepted = await useCase.acceptInvitation({
      invitation: invitation(),
      turn_id: "turn_invite",
      message_id: canonicalMessageId(2),
      correlation_id: "corr_world_seed",
      recorded_at: RECORDED_AT,
      seed: 42,
      reduced_motion: false,
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.seeded).toBe(true);
    expect(accepted.presentation.basis).toMatchObject({
      recipe_id: "smith.b1.division-deepening.v1",
      graph_revision: 2,
      world_revision: 0,
      seed: 42,
    });
    expect(accepted.presentation.stocks.map((stock) => stock.id)).toContain(
      "finished_stock",
    );
    expect(accepted.presentation.flows.map((flow) => flow.id)).toContain(
      "wool_to_yarn",
    );
    expect(accepted.presentation.actions.map((action) => action.action_id)).toContain(
      "deepen_specialization",
    );
    expect(accepted.presentation.source.source_id).toBe("smith.b1.c1.p1");

    const stream = await store.load(EXPERIENCE_ID);
    if (!stream.ok) throw stream.error;
    expect(stream.value.at(-1)).toMatchObject({
      message_name: "reader_world.world.seeded.v2",
      payload: {
        recipe_id: "smith.b1.division-deepening.v1",
        graph_revision: 2,
        seed: 42,
      },
    });

    const wrongRecipe = await useCase.present({
      experience_id: EXPERIENCE_ID,
      recipe_id: "smith.b1.market-extent.v1",
      reduced_motion: false,
    });
    expect(wrongRecipe).toEqual({
      ok: false,
      code: "WORLD_IDENTITY_MISMATCH",
    });

    const restored = await useCase.restore({
      experience_id: EXPERIENCE_ID,
      reduced_motion: true,
    });
    expect(restored).toMatchObject({
      ok: true,
      presentation: {
        basis: {
          recipe_id: "smith.b1.division-deepening.v1",
          world_revision: 0,
        },
        motion_mode: "reduced",
      },
    });

    const retried = await useCase.acceptInvitation({
      invitation: invitation(),
      turn_id: "turn_invite",
      message_id: canonicalMessageId(3),
      correlation_id: "corr_world_seed_retry",
      recorded_at: RECORDED_AT,
      seed: 42,
      reduced_motion: true,
    });
    expect(retried.ok).toBe(true);
    if (!retried.ok) return;
    expect(retried.seeded).toBe(false);
    expect(retried.presentation.motion_mode).toBe("reduced");

    const afterRetry = await store.load(EXPERIENCE_ID);
    if (!afterRetry.ok) throw afterRetry.error;
    expect(afterRetry.value).toHaveLength(stream.value.length);
  });

  it("restores the frozen seeded.v1 WoolTown stream through the read-only market recipe adapter", async () => {
    const store = new InMemoryEventStore();
    await committedGraph(store);
    await committedLegacyWoolTown(store);
    const useCase = createReaderWorldUseCase({
      store,
      principal_id: PRINCIPAL_ID,
      draft_factory: draftFactory,
    });

    const restored = await useCase.restore({
      experience_id: EXPERIENCE_ID,
      reduced_motion: true,
    });

    expect(restored).toMatchObject({
      ok: true,
      presentation: {
        basis: {
          world_id: "world_wool_town_g2",
          recipe_id: "smith.b1.market-extent.v1",
          graph_revision: 2,
          seed: 42,
        },
        motion_mode: "reduced",
      },
    });
    if (!restored.ok) return;
    expect(restored.presentation.actions).toEqual([]);
    const stream = await store.load(EXPERIENCE_ID);
    if (!stream.ok) throw stream.error;
    expect(
      stream.value.filter((event) =>
        event.message_name.startsWith("reader_world.world.seeded."),
      ),
    ).toEqual([
      expect.objectContaining({
        message_name: "reader_world.world.seeded.v1",
      }),
    ]);
  });

  it("converges overlapping accepts on the invitation-derived EventStore identity", async () => {
    const store = new InMemoryEventStore();
    await committedGraph(store);
    const useCase = createReaderWorldUseCase({
      store,
      principal_id: PRINCIPAL_ID,
      draft_factory: draftFactory,
    });
    const displayedInvitation = invitation();
    const acceptanceId = deriveWorldInvitationAcceptanceId(
      displayedInvitation.question_key,
    );
    const acceptance = {
      invitation: displayedInvitation,
      turn_id: acceptanceId,
      message_id: "01K25V2J000000000000000011",
      correlation_id: "corr_world_seed_overlap",
      recorded_at: RECORDED_AT,
      seed: 42,
      reduced_motion: false,
    } as const;

    const [first, second] = await Promise.all([
      useCase.acceptInvitation(acceptance),
      useCase.acceptInvitation(acceptance),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(Number(first.seeded) + Number(second.seeded)).toBe(1);

    const stream = await store.load(EXPERIENCE_ID);
    if (!stream.ok) throw stream.error;
    expect(
      stream.value.filter(
        (event) => event.message_name === "reader_world.world.seeded.v2",
      ),
    ).toHaveLength(1);
    const receipt = await store.getIdempotencyReceipt(
      PRINCIPAL_ID,
      EXPERIENCE_ID,
      acceptanceId,
    );
    expect(receipt).toMatchObject({
      ok: true,
      value: { idempotency_key: acceptanceId },
    });
  });

  it("returns the committed action as a presentation timeline", async () => {
    const store = new InMemoryEventStore();
    await committedGraph(store);
    const dispatchWorld = createWorldDispatchPort({
      store,
      principal_id: PRINCIPAL_ID,
      draft_factory: (input) =>
        draftFactory({ ...input, recorded_at: RECORDED_AT }),
    });
    const useCase = createReaderWorldUseCase({
      store,
      principal_id: PRINCIPAL_ID,
      draft_factory: draftFactory,
      dispatch_world: dispatchWorld,
    });
    const accepted = await useCase.acceptInvitation({
      invitation: invitation(),
      turn_id: "turn_invite_action",
      message_id: canonicalMessageId(4),
      correlation_id: "corr_world_seed_action",
      recorded_at: RECORDED_AT,
      seed: 42,
      reduced_motion: true,
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;

    const basis = accepted.presentation.basis;
    const turnId = "turn_world_action";
    const command = {
      action: "deepen_specialization" as const,
      experience_id: EXPERIENCE_ID,
      world_id: basis.world_id,
      graph_revision: basis.graph_revision,
      expected_world_revision: basis.world_revision,
      ruleset_id: basis.ruleset_id,
    };
    const acted = await useCase.act({
      experience_id: EXPERIENCE_ID,
      reduced_motion: true,
      turn_id: turnId,
      command,
      idempotency_key: deriveWorldActionIdempotencyKey(
        turnId,
        command.action,
        {
          experience_id: EXPERIENCE_ID,
          world_id: basis.world_id,
          graph_revision: basis.graph_revision,
          world_revision: basis.world_revision,
          ruleset_id: basis.ruleset_id,
        },
      ),
    });

    expect(acted.ok).toBe(true);
    if (!acted.ok) return;
    expect(acted.dispatch).toMatchObject({
      ok: true,
      committed: true,
      world_revision: 1,
      event_count: 1,
    });
    expect(acted.presentation.basis.world_revision).toBe(1);
    expect(acted.presentation.timeline).toHaveLength(1);
    expect(acted.presentation.timeline[0]).toMatchObject({
      actor_id: "weaver",
      event_kind: "character_accept",
    });
  });

});