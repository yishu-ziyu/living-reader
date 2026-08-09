import type { AgentWorldInvitation } from "@/modules/agent-os/turn";
import {
  inspectCurrentWorld,
  type WorldDispatchPort,
  type WorldDispatchReceipt,
} from "@/modules/agent-os/world-dispatch";
import {
  compilePresentation,
  compileReviewedRecipe,
  createWoolTownBaseline,
  WOOL_TOWN_RULESET_ID,
  type PresentationPlan,
  type WorldCommand,
} from "@/modules/world";
import type { EventStore } from "./event-store";
import {
  asDomainEventDraft,
  type CreateDraftInput,
  type DomainEvent,
  type DomainEventDraft,
} from "./events";

type SeedDraftInput = CreateDraftInput<"reader_world.world.seeded.v2"> &
  Required<Pick<CreateDraftInput<"reader_world.world.seeded.v2">, "message_id" | "recorded_at">>;

export type ReaderWorldDraftFactory = (
  input: SeedDraftInput,
) => Promise<DomainEventDraft>;

export type ReaderWorldUseCaseFailureCode =
  | "GRAPH_NOT_CURRENT"
  | "RECIPE_NOT_REVIEWED"
  | "WORLD_IDENTITY_MISMATCH"
  | "STORE_UNAVAILABLE"
  | "PRESENTATION_UNAVAILABLE"
  | "DISPATCH_UNAVAILABLE";

export type ReaderWorldUseCaseResult<T> =
  | ({ ok: true } & T)
  | { ok: false; code: ReaderWorldUseCaseFailureCode };

export type AcceptWorldInvitationInput = Readonly<{
  invitation: AgentWorldInvitation;
  turn_id: string;
  message_id: string;
  correlation_id: string;
  recorded_at: string;
  seed: number;
  reduced_motion: boolean;
}>;

export type PresentWorldInput = Readonly<{
  experience_id: string;
  recipe_id: string;
  reduced_motion: boolean;
}>;

export type RestoreWorldInput = Readonly<{
  experience_id: string;
  reduced_motion: boolean;
}>;

export type ActInWorldInput = Readonly<{
  experience_id: string;
  reduced_motion: boolean;
  turn_id: string;
  command: WorldCommand;
  idempotency_key: string;
}>;

export type ReaderWorldUseCase = Readonly<{
  acceptInvitation: (
    input: AcceptWorldInvitationInput,
  ) => Promise<ReaderWorldUseCaseResult<{ seeded: boolean; presentation: PresentationPlan }>>;
  present: (
    input: PresentWorldInput,
  ) => Promise<ReaderWorldUseCaseResult<{ presentation: PresentationPlan }>>;
  restore: (
    input: RestoreWorldInput,
  ) => Promise<ReaderWorldUseCaseResult<{ presentation: PresentationPlan }>>;
  act: (
    input: ActInWorldInput,
  ) => Promise<
    ReaderWorldUseCaseResult<{
      dispatch: WorldDispatchReceipt;
      presentation: PresentationPlan;
    }>
  >;
}>;

type ReaderWorldUseCaseDependencies = Readonly<{
  store: EventStore;
  principal_id: string;
  draft_factory: ReaderWorldDraftFactory;
  dispatch_world?: WorldDispatchPort;
}>;
const LEGACY_WOOL_TOWN_RESTORE = Object.freeze({
  recipe_id: "smith.b1.market-extent.v1",
  ruleset_id: WOOL_TOWN_RULESET_ID,
  seed: 42,
});

export function deriveWorldInvitationAcceptanceId(questionKey: string): string {
  return `world-invitation:${questionKey}`;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const values = new Set(left);
  return values.size === left.length && right.every((value) => values.has(value));
}

function matchingGraphCommit(
  events: readonly DomainEvent[],
  invitation: AgentWorldInvitation,
): DomainEvent | null {
  const basis = invitation.basis;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.message_name !== "reader_world.graph.committed.v1") continue;
    if (
      event.payload.graph_revision === basis.graph_revision &&
      event.payload.accepted_relation_ids.includes(basis.relation_id) &&
      sameStrings(event.payload.accepted_relation_ids, basis.accepted_relation_ids)
    ) {
      return event;
    }
    return null;
  }
  return null;
}

function seededEvents(events: readonly DomainEvent[]): DomainEvent[] {
  return events.filter(
    (event) =>
      event.message_name === "reader_world.world.seeded.v1" ||
      event.message_name === "reader_world.world.seeded.v2",
  );
}

function activeRecipeId(events: readonly DomainEvent[]): string | null {
  const seeds = seededEvents(events);
  return seeds.length === 1 && seeds[0]?.message_name === "reader_world.world.seeded.v2"
    ? seeds[0].payload.recipe_id
    : null;
}

function sameLegacyBaselineMetrics(
  left: ReturnType<typeof createWoolTownBaseline>["metrics"],
  right: ReturnType<typeof createWoolTownBaseline>["metrics"],
): boolean {
  return (
    left.output === right.output &&
    left.stock === right.stock &&
    left.reachable_orders === right.reachable_orders &&
    left.cash === right.cash
  );
}

/**
 * Read-only replay adapter for the sole production seeded.v1 WoolTown shape.
 * The mapping stays pinned to the reviewed recipe whose compiled default state
 * matches the frozen legacy baseline. Mutations still require a seeded.v2 recipe.
 */
function legacyRestoreRecipeId(events: readonly DomainEvent[]): string | null {
  const seeds = seededEvents(events);
  if (seeds.length !== 1) return null;
  const seed = seeds[0];
  if (!seed || seed.message_name !== "reader_world.world.seeded.v1") {
    return null;
  }
  if (
    seed.payload.world_id !== `world_wool_town_g${seed.payload.graph_revision}` ||
    seed.payload.ruleset_id !== LEGACY_WOOL_TOWN_RESTORE.ruleset_id ||
    seed.payload.seed !== LEGACY_WOOL_TOWN_RESTORE.seed
  ) {
    return null;
  }

  const legacy = createWoolTownBaseline({
    experience_id: seed.experience_id,
    world_id: seed.payload.world_id,
    graph_revision: seed.payload.graph_revision,
    seed: seed.payload.seed,
  });
  const compiled = compileReviewedRecipe({
    recipe_id: LEGACY_WOOL_TOWN_RESTORE.recipe_id,
    seed: seed.payload.seed,
    experience_id: seed.experience_id,
    world_id: seed.payload.world_id,
    graph_revision: seed.payload.graph_revision,
  });
  if (
    !compiled.ok ||
    compiled.value.definition.initial_state.ruleset_id !== legacy.ruleset_id ||
    !sameLegacyBaselineMetrics(
      compiled.value.definition.initial_state.metrics,
      legacy.metrics,
    )
  ) {
    return null;
  }
  return LEGACY_WOOL_TOWN_RESTORE.recipe_id;
}


function worldIdFor(recipeId: string, graphRevision: number): string {
  const recipe = recipeId.replace(/[^a-zA-Z0-9]+/gu, "_").replace(/^_+|_+$/gu, "");
  return `world_${recipe}_g${graphRevision}`;
}

type WorldEventRecorded = Extract<
  DomainEvent,
  { message_name: "reader_world.world.event_recorded.v1" }
>;

function isWorldEventRecorded(event: DomainEvent): event is WorldEventRecorded {
  return event.message_name === "reader_world.world.event_recorded.v1";
}

function currentWorldEvents(events: readonly DomainEvent[], worldRevision: number) {
  return events
    .filter(
      (event): event is WorldEventRecorded =>
        isWorldEventRecorded(event) &&
        event.payload.world_revision === worldRevision,
    )
    .map((event) => ({
      event_kind: event.payload.event_kind,
      actor_id: event.payload.actor_id ?? null,
      summary: event.payload.summary,
      causation_index: event.event_index_in_commit,
      metrics: event.payload.metrics ?? {},
    }));
}

export function createReaderWorldUseCase(
  dependencies: ReaderWorldUseCaseDependencies,
): ReaderWorldUseCase {
  async function presentStoredWorld(
    input: RestoreWorldInput,
    expectedRecipeId?: string,
  ): Promise<ReaderWorldUseCaseResult<{ presentation: PresentationPlan }>> {
    const inspected = await inspectCurrentWorld({
      store: dependencies.store,
      experience_id: input.experience_id,
    });
    if (!inspected.ok) {
      return {
        ok: false,
        code:
          inspected.code === "TEMPORARY_FAILURE"
            ? "STORE_UNAVAILABLE"
            : "WORLD_IDENTITY_MISMATCH",
      };
    }
    const loaded = await dependencies.store.load(input.experience_id);
    if (!loaded.ok) return { ok: false, code: "STORE_UNAVAILABLE" };
    const currentRecipeId = activeRecipeId(loaded.value);
    const legacyRecipeId = currentRecipeId
      ? null
      : legacyRestoreRecipeId(loaded.value);
    const recipeId = currentRecipeId ?? legacyRecipeId;
    if (!recipeId || (expectedRecipeId && recipeId !== expectedRecipeId)) {
      return { ok: false, code: "WORLD_IDENTITY_MISMATCH" };
    }
    const compiled = compileReviewedRecipe({
      recipe_id: recipeId,
      seed: inspected.world_state.seed,
      experience_id: input.experience_id,
      world_id: inspected.world_state.world_id,
      graph_revision: inspected.world_state.graph_revision,
    });
    if (!compiled.ok) return { ok: false, code: "RECIPE_NOT_REVIEWED" };

    const presentation = compilePresentation({
      definition: compiled.value.definition,
      state: inspected.world_state,
      events: currentWorldEvents(
        loaded.value,
        inspected.world_state.world_revision,
      ),
      reduced_motion: input.reduced_motion,
    });
    if (!presentation) {
      return { ok: false, code: "PRESENTATION_UNAVAILABLE" };
    }
    return {
      ok: true,
      presentation: legacyRecipeId
        ? Object.freeze({
            ...presentation,
            actions: Object.freeze([]),
          })
        : presentation,
    };
  }

  function present(
    input: PresentWorldInput,
  ): Promise<ReaderWorldUseCaseResult<{ presentation: PresentationPlan }>> {
    return presentStoredWorld(input, input.recipe_id);
  }

  return {
    async acceptInvitation(input) {
      const experienceId = input.invitation.basis.experience_id;
      const loaded = await dependencies.store.load(experienceId);
      if (!loaded.ok) return { ok: false, code: "STORE_UNAVAILABLE" };
      const graphCommit = matchingGraphCommit(loaded.value, input.invitation);
      if (!graphCommit) return { ok: false, code: "GRAPH_NOT_CURRENT" };

      const worldId = worldIdFor(
        input.invitation.recipe_id,
        input.invitation.basis.graph_revision,
      );
      const compiled = compileReviewedRecipe({
        recipe_id: input.invitation.recipe_id,
        seed: input.seed,
        experience_id: experienceId,
        world_id: worldId,
        graph_revision: input.invitation.basis.graph_revision,
      });
      if (!compiled.ok) return { ok: false, code: "RECIPE_NOT_REVIEWED" };

      const existingSeeds = seededEvents(loaded.value);
      if (existingSeeds.length > 1) {
        return { ok: false, code: "WORLD_IDENTITY_MISMATCH" };
      }
      let seeded = false;
      if (existingSeeds.length === 1) {
        const existing = existingSeeds[0]!;
        if (
          existing.message_name !== "reader_world.world.seeded.v2" ||
          existing.payload.world_id !== worldId ||
          existing.payload.graph_revision !== input.invitation.basis.graph_revision ||
          existing.payload.seed !== input.seed ||
          existing.payload.recipe_id !== input.invitation.recipe_id ||
          existing.payload.recipe_fingerprint !== compiled.value.recipe_fingerprint
        ) {
          return { ok: false, code: "WORLD_IDENTITY_MISMATCH" };
        }
      } else {
        const version = await dependencies.store.getVersion(experienceId);
        const lastStreamVersion = loaded.value.at(-1)?.stream_version ?? 0;
        if (!version.ok || version.value !== lastStreamVersion) {
          return { ok: false, code: "STORE_UNAVAILABLE" };
        }
        const draft = await dependencies.draft_factory({
          message_name: "reader_world.world.seeded.v2",
          message_id: input.message_id,
          experience_id: experienceId,
          correlation_id: input.correlation_id,
          causation_id: graphCommit.message_id,
          producer: {
            module: "reader_world",
            instance: "reader-world-use-case",
          },
          security: {
            principal_id: dependencies.principal_id,
            authority: "system",
            integrity: "local",
          },
          recorded_at: input.recorded_at,
          payload: {
            world_id: worldId,
            graph_revision: input.invitation.basis.graph_revision,
            seed: input.seed,
            ruleset_id: compiled.value.definition.ruleset.ruleset_id,
            recipe_id: input.invitation.recipe_id,
            recipe_fingerprint: compiled.value.recipe_fingerprint,
            normalized_parameters: compiled.value.normalized_parameters,
          },
        });
        const appended = await dependencies.store.append({
          experience_id: experienceId,
          principal_id: dependencies.principal_id,
          idempotency_key: deriveWorldInvitationAcceptanceId(
            input.invitation.question_key,
          ),
          expected_version: version.value === 0 ? -1 : version.value,
          events: [asDomainEventDraft(draft)],
        });
        if (!appended.ok) return { ok: false, code: "STORE_UNAVAILABLE" };
        seeded = !appended.value.duplicate;
      }

      const presented = await present({
        experience_id: experienceId,
        recipe_id: input.invitation.recipe_id,
        reduced_motion: input.reduced_motion,
      });
      return presented.ok
        ? { ok: true, seeded, presentation: presented.presentation }
        : presented;
    },

    restore(input) {
      return presentStoredWorld(input);
    },

    present,

    async act(input) {
      if (!dependencies.dispatch_world) {
        return { ok: false, code: "DISPATCH_UNAVAILABLE" };
      }
      const loaded = await dependencies.store.load(input.experience_id);
      if (!loaded.ok) return { ok: false, code: "STORE_UNAVAILABLE" };
      const recipeId = activeRecipeId(loaded.value);
      if (!recipeId) return { ok: false, code: "WORLD_IDENTITY_MISMATCH" };
      const dispatch = await dependencies.dispatch_world({
        turn_id: input.turn_id,
        command: input.command,
        idempotency_key: input.idempotency_key,
      });
      if (!dispatch.ok || !dispatch.committed) {
        return { ok: false, code: "WORLD_IDENTITY_MISMATCH" };
      }
      const presented = await present({
        experience_id: input.experience_id,
        recipe_id: recipeId,
        reduced_motion: input.reduced_motion,
      });
      return presented.ok
        ? { ok: true, dispatch, presentation: presented.presentation }
        : presented;
    },
  };
}
