import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "@/infrastructure/event-store/memory";
import {
  deriveWorldActionIdempotencyKey,
  type AgentTurnDispatchPort,
} from "@/modules/agent-os/turn";
import type {
  AppendEventsRequest,
  EventStore,
} from "@/modules/reader-world/event-store";
import {
  asDomainEventDraft,
  createDomainEventDraft,
  type CreateDraftInput,
  type DomainEvent,
  type DomainEventDraft,
  type DomainEventName,
} from "@/modules/reader-world/events";
import {
  createWorldDispatchPort,
  inspectCurrentWorld,
  type WorldDispatchDraftFactory,
} from "@/modules/agent-os/world-dispatch";
import {
  compileReviewedRecipe,
  type WorldCommand,
} from "@/modules/world";

const EXPERIENCE_ID = "exp_t009_wool";
const PRINCIPAL_ID = "reader_t009";
const WORLD_ID = "world_t009_wool";
const RULESET_ID = "wool-town-v1";
const FIXED_TIME = "2026-08-09T08:00:00.000Z";
const CANONICAL_ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

type RecordedStore = {
  inner: InMemoryEventStore;
  store: EventStore;
  append_requests: AppendEventsRequest[];
};

function createRecordedStore(): RecordedStore {
  const inner = new InMemoryEventStore();
  const append_requests: AppendEventsRequest[] = [];
  return {
    inner,
    append_requests,
    store: {
      append: async (request) => {
        append_requests.push(request);
        return inner.append(request);
      },
      load: (experience_id, options) => inner.load(experience_id, options),
      getVersion: (experience_id) => inner.getVersion(experience_id),
      getIdempotencyReceipt: (principal_id, experience_id, idempotency_key) =>
        inner.getIdempotencyReceipt(principal_id, experience_id, idempotency_key),
    },
  };
}

function command(
  action = "expand_market",
  overrides: Partial<WorldCommand> = {},
): WorldCommand {
  return {
    action,
    experience_id: EXPERIENCE_ID,
    world_id: WORLD_ID,
    graph_revision: 1,
    expected_world_revision: 0,
    ruleset_id: RULESET_ID,
    ...overrides,
  };
}

function agentTurnKey(turn_id: string, input: WorldCommand): string {
  return deriveWorldActionIdempotencyKey(
    turn_id,
    input.action as "deepen_specialization" | "expand_market",
    {
      experience_id: input.experience_id,
      world_id: input.world_id,
      graph_revision: input.graph_revision,
      world_revision: input.expected_world_revision,
      ruleset_id: input.ruleset_id,
    },
  );
}

function nodeDraft<N extends DomainEventName>(
  input: CreateDraftInput<N>,
): DomainEventDraft {
  return asDomainEventDraft(createDomainEventDraft(input));
}

const draft_factory: WorldDispatchDraftFactory = async (input) =>
  nodeDraft({ ...input, recorded_at: FIXED_TIME });

async function appendCanonicalBaseline(store: EventStore): Promise<void> {
  const graph = nodeDraft({
    message_name: "reader_world.graph.committed.v1",
    experience_id: EXPERIENCE_ID,
    correlation_id: "seed-graph",
    producer: { module: "reader_world", instance: "test" },
    security: {
      principal_id: PRINCIPAL_ID,
      authority: "reader",
      integrity: "local",
    },
    recorded_at: FIXED_TIME,
    payload: {
      graph_revision: 1,
      accepted_relation_ids: ["rel_market_extent"],
      basis_graph_revision: 0,
    },
  });
  const seed = nodeDraft({
    message_name: "reader_world.world.seeded.v1",
    experience_id: EXPERIENCE_ID,
    correlation_id: "seed-world",
    producer: { module: "reader_world", instance: "test" },
    security: {
      principal_id: PRINCIPAL_ID,
      authority: "system",
      integrity: "local",
    },
    recorded_at: FIXED_TIME,
    payload: {
      world_id: WORLD_ID,
      graph_revision: 1,
      seed: 42,
      ruleset_id: RULESET_ID,
    },
  });
  const result = await store.append({
    experience_id: EXPERIENCE_ID,
    principal_id: PRINCIPAL_ID,
    idempotency_key: "seed-baseline",
    expected_version: -1,
    events: [graph, seed],
  });
  if (!result.ok) throw result.error;
}

async function appendRecipeBaseline(
  store: EventStore,
  recipe_id: "smith.b1.division-deepening.v1" | "smith.b1.market-extent.v1",
  parameters: Record<string, number> = {},
  overrides: Partial<{
    recipe_fingerprint: string;
    normalized_parameters: Record<string, string | number | boolean>;
  }> = {},
): Promise<void> {
  const compiled = compileReviewedRecipe({
    recipe_id,
    parameters,
    seed: 42,
    experience_id: EXPERIENCE_ID,
    world_id: WORLD_ID,
    graph_revision: 1,
  });
  if (!compiled.ok) throw new Error(compiled.code);
  const graph = nodeDraft({
    message_name: "reader_world.graph.committed.v1",
    experience_id: EXPERIENCE_ID,
    correlation_id: "seed-recipe-graph",
    producer: { module: "reader_world", instance: "test" },
    security: {
      principal_id: PRINCIPAL_ID,
      authority: "reader",
      integrity: "local",
    },
    recorded_at: FIXED_TIME,
    payload: {
      graph_revision: 1,
      accepted_relation_ids: ["rel_recipe"],
      basis_graph_revision: 0,
    },
  });
  const seed = nodeDraft({
    message_name: "reader_world.world.seeded.v2",
    experience_id: EXPERIENCE_ID,
    correlation_id: "seed-recipe-world",
    producer: { module: "reader_world", instance: "test" },
    security: {
      principal_id: PRINCIPAL_ID,
      authority: "system",
      integrity: "local",
    },
    recorded_at: FIXED_TIME,
    payload: {
      world_id: WORLD_ID,
      graph_revision: 1,
      seed: 42,
      ruleset_id: RULESET_ID,
      recipe_id,
      recipe_fingerprint:
        overrides.recipe_fingerprint ?? compiled.value.recipe_fingerprint,
      normalized_parameters:
        overrides.normalized_parameters ??
        compiled.value.normalized_parameters,
    },
  });
  const result = await store.append({
    experience_id: EXPERIENCE_ID,
    principal_id: PRINCIPAL_ID,
    idempotency_key: "seed-recipe-baseline",
    expected_version: -1,
    events: [graph, seed],
  });
  if (!result.ok) throw result.error;
}

async function appendWorldRecord(
  store: EventStore,
  payload: {
    world_id?: string;
    world_revision: number;
    event_kind?: string;
    actor_id?: string | null;
    summary?: string;
    metrics?: Record<string, number | string | boolean>;
  },
): Promise<void> {
  const version = await store.getVersion(EXPERIENCE_ID);
  if (!version.ok) throw version.error;
  const event = nodeDraft({
    message_name: "reader_world.world.event_recorded.v1",
    experience_id: EXPERIENCE_ID,
    correlation_id: "manual-world-record",
    producer: { module: "reader_world", instance: "test" },
    security: {
      principal_id: PRINCIPAL_ID,
      authority: "system",
      integrity: "local",
    },
    recorded_at: FIXED_TIME,
    payload: {
      world_id: payload.world_id ?? WORLD_ID,
      world_revision: payload.world_revision,
      event_kind: payload.event_kind ?? "character_observation",
      actor_id: payload.actor_id ?? "merchant",
      summary: payload.summary ?? "merchant:ship:orders_open",
      ...(payload.metrics ? { metrics: payload.metrics } : {}),
    },
  });
  const result = await store.append({
    experience_id: EXPERIENCE_ID,
    principal_id: PRINCIPAL_ID,
    idempotency_key: `manual-world-${version.value}`,
    expected_version: version.value,
    events: [event],
  });
  if (!result.ok) throw result.error;
}

async function dispatch(
  store: EventStore,
  input: WorldCommand,
  turn_id = "turn-expand",
  idempotency_key = agentTurnKey(turn_id, input),
) {
  const port = createWorldDispatchPort({
    store,
    principal_id: PRINCIPAL_ID,
    draft_factory,
  });
  return port({
    turn_id,
    command: input,
    idempotency_key,
  });
}

function corruptMetricsOnLoad(store: EventStore): EventStore {
  return {
    append: (request) => store.append(request),
    getVersion: (experience_id) => store.getVersion(experience_id),
    getIdempotencyReceipt: (principal_id, experience_id, idempotency_key) =>
      store.getIdempotencyReceipt(principal_id, experience_id, idempotency_key),
    load: async (experience_id, options) => {
      const loaded = await store.load(experience_id, options);
      if (!loaded.ok) return loaded;
      return {
        ok: true as const,
        value: loaded.value.map((event) =>
          event.message_name === "reader_world.world.event_recorded.v1"
            ? ({
                ...event,
                payload: {
                  ...event.payload,
                  metrics: {
                    supply: 17,
                    inventory: 11,
                    demand: 4,
                    cash: Number.NaN,
                  },
                },
              } as DomainEvent)
            : event,
        ),
      };
    },
  };
}

describe("T009 world EventStore dispatcher", () => {
  it("keeps createWorldDispatchPort assignable to explicit AgentTurnDispatchPort", () => {
    const { store } = createRecordedStore();
    const port: AgentTurnDispatchPort = createWorldDispatchPort({
      store,
      principal_id: PRINCIPAL_ID,
      draft_factory,
    });

    expect(port).toBeTypeOf("function");
  });

  it("rebuilds canonical baseline seed + committed graph, then atomically expands market", async () => {
    const { store, append_requests } = createRecordedStore();
    await appendCanonicalBaseline(store);
    append_requests.length = 0;

    const receipt = await dispatch(store, command());

    expect(receipt).toMatchObject({
      ok: true,
      committed: true,
      duplicate: false,
      code: "OK",
      world_revision: 1,
      event_count: 4,
    });
    expect(append_requests).toHaveLength(1);
    expect(append_requests[0]).toMatchObject({ expected_version: 2 });
    expect(append_requests[0]?.events).toHaveLength(4);

    const loaded = await store.load(EXPERIENCE_ID);
    if (!loaded.ok) throw loaded.error;
    const events = loaded.value.filter(
      (event) => event.message_name === "reader_world.world.event_recorded.v1",
    );
    expect(events).toHaveLength(4);
    expect(events.map((event) => event.payload.actor_id)).toEqual([
      "merchant",
      "shepherd",
      "spinner",
      "weaver",
    ]);
    expect(events.map((event) => event.payload.world_revision)).toEqual([1, 1, 1, 1]);
    expect(events.every((event) => !("causation_index" in event.payload))).toBe(true);
    expect(events.every((event) => event.payload.metrics?.cash === 28)).toBe(true);
    const messageIds = events.map((event) => event.message_id);
    expect(
      messageIds.every((id) => CANONICAL_ULID_PATTERN.test(id)),
    ).toBe(true);
    expect(new Set(messageIds).size).toBe(4);
    expect(receipt.message_ids).toEqual(messageIds);
  });

  it("records baseline specialization refusal without changing compiled metrics", async () => {
    const { store, append_requests } = createRecordedStore();
    await appendCanonicalBaseline(store);
    append_requests.length = 0;

    const receipt = await dispatch(store, command("deepen_specialization"), "turn-refuse");

    expect(receipt).toMatchObject({
      ok: true,
      committed: true,
      duplicate: false,
      code: "CHARACTER_REFUSAL",
      world_revision: 1,
      event_count: 1,
    });
    expect(append_requests).toHaveLength(1);
    const loaded = await store.load(EXPERIENCE_ID);
    if (!loaded.ok) throw loaded.error;
    const event = loaded.value.at(-1);
    expect(event?.message_name).toBe("reader_world.world.event_recorded.v1");
    if (event?.message_name !== "reader_world.world.event_recorded.v1") {
      throw new Error("expected world event");
    }
    expect(event.payload).toMatchObject({
      world_revision: 1,
      event_kind: "character_refusal",
      actor_id: "weaver",
      metrics: { supply: 12, inventory: 8, demand: 2, cash: 24 },
    });
  });

  it("inspects the replayed baseline and advanced world for the AgentTurn port", async () => {
    const { store, append_requests } = createRecordedStore();
    await appendCanonicalBaseline(store);
    append_requests.length = 0;

    const baseline = await inspectCurrentWorld({
      store,
      experience_id: EXPERIENCE_ID,
    });
    expect(baseline).toMatchObject({
      ok: true,
      last_stream_version: 2,
      world_state: {
        world_id: WORLD_ID,
        graph_revision: 1,
        world_revision: 0,
        ruleset_id: RULESET_ID,
        phase: "playable",
        metrics: { output: 12, stock: 8, reachable_orders: 2, cash: 24 },
      },
    });
    expect(append_requests).toHaveLength(0);

    await dispatch(store, command(), "turn-inspect");
    const advanced = await inspectCurrentWorld({
      store,
      experience_id: EXPERIENCE_ID,
    });
    expect(advanced).toMatchObject({
      ok: true,
      last_stream_version: 6,
      world_state: {
        world_revision: 1,
        phase: "playable",
        metrics: { output: 17, stock: 11, reachable_orders: 4, cash: 28 },
      },
    });
  });

  it("recompiles a seeded.v2 recipe and exactly replays its committed action", async () => {
    const { store, append_requests } = createRecordedStore();
    await appendRecipeBaseline(store, "smith.b1.market-extent.v1", {
      initial_cash: 50,
      reachable_orders: 5,
    });
    append_requests.length = 0;

    const baseline = await inspectCurrentWorld({
      store,
      experience_id: EXPERIENCE_ID,
    });
    expect(baseline).toMatchObject({
      ok: true,
      last_stream_version: 2,
      world_state: {
        world_revision: 0,
        metrics: { output: 12, stock: 8, reachable_orders: 5, cash: 50 },
      },
    });

    const receipt = await dispatch(store, command("expand_market"), "turn-recipe");
    expect(receipt).toMatchObject({
      ok: true,
      committed: true,
      code: "OK",
      world_revision: 1,
      event_count: 4,
    });
    const replayed = await inspectCurrentWorld({
      store,
      experience_id: EXPERIENCE_ID,
    });
    expect(replayed).toMatchObject({
      ok: true,
      world_state: {
        world_revision: 1,
        metrics: { output: 17, stock: 11, reachable_orders: 7, cash: 54 },
      },
    });
    expect(append_requests).toHaveLength(1);
  });

  it("enforces the compiled recipe action allowlist", async () => {
    const { store, append_requests } = createRecordedStore();
    await appendRecipeBaseline(store, "smith.b1.division-deepening.v1");
    append_requests.length = 0;

    const receipt = await dispatch(
      store,
      command("expand_market"),
      "turn-recipe-unsupported",
    );

    expect(receipt).toMatchObject({
      ok: false,
      committed: false,
      code: "ACTION_UNSUPPORTED",
      event_count: 0,
    });
    expect(append_requests).toHaveLength(0);
  });

  it("fails closed when seeded.v2 fingerprint or normalized parameters drift", async () => {
    const badFingerprint = createRecordedStore();
    await appendRecipeBaseline(
      badFingerprint.store,
      "smith.b1.market-extent.v1",
      {},
      { recipe_fingerprint: "recipe-v1:tampered" },
    );
    expect(
      await inspectCurrentWorld({
        store: badFingerprint.store,
        experience_id: EXPERIENCE_ID,
      }),
    ).toEqual({ ok: false, code: "INVALID_STATE" });

    const nonCanonicalParameters = createRecordedStore();
    await appendRecipeBaseline(
      nonCanonicalParameters.store,
      "smith.b1.market-extent.v1",
      {},
      {
        normalized_parameters: {
          initial_cash: 24,
          reachable_orders: 999,
        },
      },
    );
    expect(
      await inspectCurrentWorld({
        store: nonCanonicalParameters.store,
        experience_id: EXPERIENCE_ID,
      }),
    ).toEqual({ ok: false, code: "INVALID_STATE" });
  });

  it("returns the stored receipt for a duplicate key and appends nothing", async () => {
    const { store, append_requests } = createRecordedStore();
    await appendCanonicalBaseline(store);
    append_requests.length = 0;
    const input = command();
    const key = agentTurnKey("turn-duplicate", input);

    const first = await dispatch(store, input, "turn-duplicate", key);
    const stored = await store.getIdempotencyReceipt(
      PRINCIPAL_ID,
      input.experience_id,
      key,
    );
    if (!stored.ok) throw stored.error;
    const afterFirst = await store.load(EXPERIENCE_ID);
    if (!afterFirst.ok) throw afterFirst.error;
    const countAfterFirst = afterFirst.value.length;
    const retry = await dispatch(store, input, "turn-duplicate", key);
    const afterRetry = await store.load(EXPERIENCE_ID);
    if (!afterRetry.ok) throw afterRetry.error;
    const countAfterRetry = afterRetry.value.length;

    expect(first).toMatchObject({ duplicate: false, event_count: 4, world_revision: 1 });
    expect(stored.value?.message_ids).toEqual(first.message_ids);
    expect(retry).toMatchObject({
      ok: true,
      committed: true,
      duplicate: true,
      code: "OK",
      event_count: 4,
      world_revision: 1,
    });
    expect(retry.message_ids).toEqual(first.message_ids);
    expect(countAfterRetry).toBe(countAfterFirst);
    expect(append_requests).toHaveLength(1);
  });

  it("fails closed for stale expected world revision, unsupported action, and a key stamped for different payload", async () => {
    const { store, append_requests } = createRecordedStore();
    await appendCanonicalBaseline(store);
    append_requests.length = 0;

    const staleCommand = command("expand_market", { expected_world_revision: 1 });
    const stale = await dispatch(store, staleCommand, "turn-stale");
    const unsupportedCommand = command("constrain_market");
    const unsupported = await dispatch(store, unsupportedCommand, "turn-unsupported");
    const canonical = command();
    const payloadMismatch = await dispatch(
      store,
      command("deepen_specialization"),
      "turn-mismatch",
      agentTurnKey("turn-mismatch", canonical),
    );

    expect(stale).toMatchObject({
      ok: false,
      committed: false,
      duplicate: false,
      code: "EXPECTED_WORLD_REVISION_MISMATCH",
      event_count: 0,
    });
    expect(unsupported).toMatchObject({
      ok: false,
      committed: false,
      duplicate: false,
      code: "ACTION_UNSUPPORTED",
      event_count: 0,
    });
    expect(payloadMismatch).toMatchObject({
      ok: false,
      committed: false,
      duplicate: false,
      event_count: 0,
    });
    expect(append_requests).toHaveLength(0);
  });

  it("does not dispatch from incomplete or non-finite raw metrics", async () => {
    const incomplete = createRecordedStore();
    await appendCanonicalBaseline(incomplete.store);
    await appendWorldRecord(incomplete.store, {
      world_revision: 1,
      metrics: { supply: 17 },
    });
    incomplete.append_requests.length = 0;

    const incompleteReceipt = await dispatch(
      incomplete.store,
      command("expand_market", { expected_world_revision: 1 }),
      "turn-incomplete",
    );
    expect(incompleteReceipt).toMatchObject({
      ok: false,
      committed: false,
      code: "INVALID_STATE",
      event_count: 0,
    });
    expect(incomplete.append_requests).toHaveLength(0);

    const tampered = createRecordedStore();
    await appendCanonicalBaseline(tampered.store);
    await appendWorldRecord(tampered.store, {
      world_revision: 1,
      metrics: { supply: 17, inventory: 11, demand: 4, cash: 28 },
    });
    tampered.append_requests.length = 0;

    const tamperedReceipt = await dispatch(
      corruptMetricsOnLoad(tampered.store),
      command("expand_market", { expected_world_revision: 1 }),
      "turn-tampered",
    );
    expect(tamperedReceipt).toMatchObject({
      ok: false,
      committed: false,
      code: "INVALID_STATE",
      event_count: 0,
    });
    expect(tampered.append_requests).toHaveLength(0);
  });

  it("rejects cross-world records and reseeding instead of trusting foldWorld.seeded", async () => {
    const crossWorld = createRecordedStore();
    await appendCanonicalBaseline(crossWorld.store);
    await appendWorldRecord(crossWorld.store, {
      world_id: "world_other",
      world_revision: 1,
      metrics: { supply: 17, inventory: 11, demand: 4, cash: 28 },
    });
    crossWorld.append_requests.length = 0;
    const crossWorldInspection = await inspectCurrentWorld({
      store: crossWorld.store,
      experience_id: EXPERIENCE_ID,
    });
    expect(crossWorldInspection).toEqual({
      ok: false,
      code: "WORLD_IDENTITY_MISMATCH",
    });
    const crossWorldReceipt = await dispatch(
      crossWorld.store,
      command("expand_market", { expected_world_revision: 1 }),
      "turn-cross-world",
    );
    expect(crossWorldReceipt).toMatchObject({
      ok: false,
      committed: false,
      code: "WORLD_IDENTITY_MISMATCH",
      event_count: 0,
    });
    expect(crossWorld.append_requests).toHaveLength(0);

    const reseeded = createRecordedStore();
    await appendCanonicalBaseline(reseeded.store);
    const duplicateSeed = nodeDraft({
      message_name: "reader_world.world.seeded.v1",
      experience_id: EXPERIENCE_ID,
      correlation_id: "seed-again",
      producer: { module: "reader_world", instance: "test" },
      security: {
        principal_id: PRINCIPAL_ID,
        authority: "system",
        integrity: "local",
      },
      recorded_at: FIXED_TIME,
      payload: {
        world_id: WORLD_ID,
        graph_revision: 1,
        seed: 42,
        ruleset_id: RULESET_ID,
      },
    });
    const reseedAppend = await reseeded.store.append({
      experience_id: EXPERIENCE_ID,
      principal_id: PRINCIPAL_ID,
      idempotency_key: "seed-again",
      expected_version: 2,
      events: [duplicateSeed],
    });
    if (!reseedAppend.ok) throw reseedAppend.error;
    reseeded.append_requests.length = 0;

    const reseedInspection = await inspectCurrentWorld({
      store: reseeded.store,
      experience_id: EXPERIENCE_ID,
    });
    expect(reseedInspection).toEqual({ ok: false, code: "WORLD_NOT_READY" });
    const reseedReceipt = await dispatch(reseeded.store, command(), "turn-reseed");
    expect(reseedReceipt).toMatchObject({
      ok: false,
      committed: false,
      code: "WORLD_NOT_READY",
      event_count: 0,
    });
    expect(reseeded.append_requests).toHaveLength(0);
  });
});
