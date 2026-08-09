import { deriveWorldActionIdempotencyKey } from "@/modules/agent-os/turn/handle";
import { FROZEN_WOOL_TOWN_RULESET } from "@/modules/world/domain/frozen-ruleset";
import { canonicalize } from "@/modules/world/domain/canonicalize";
import { compileReviewedRecipe } from "@/modules/world/recipe";
import { createWoolTownBaseline } from "@/modules/world/fixtures/wool-town/baseline";
import { decide } from "@/modules/world/kernel/decide";
import type { DomainEvent, DomainEventDraft } from "@/modules/reader-world/events/envelope";
import { validateEventPayload } from "@/modules/reader-world/events/payload-schema";
import type {
  AppendReceipt,
  EventStore,
  IdempotencyReceipt,
} from "@/modules/reader-world/event-store";
import { cloneWorldState } from "@/modules/world";
import type {
  KernelEventSpec,
  WorldCommand,
  WorldState,
} from "@/modules/world";
import { CANONICAL_ACTOR_ORDER } from "@/modules/world/domain/types";
import type {
  DispatchWorldActionInput,
  CurrentWorldInspection,
  InspectCurrentWorldInput,
  WorldDispatchCode,
  WorldDispatchPort,
  WorldDispatchPortConfig,
  WorldDispatchReceipt,
  WorldEventDraftFactoryInput,
} from "./types";

const MESSAGE_NAMESPACE = "reader_world.world_dispatch.v1";
const WORLD_EVENT_NAME = "reader_world.world.event_recorded.v1" as const;
const METRIC_KEYS = ["supply", "inventory", "demand", "cash"] as const;
const LEGACY_WORLD_ACTION_IDS: readonly WorldCommand["action"][] = [
  "deepen_specialization",
  "expand_market",
];
type MetricKey = (typeof METRIC_KEYS)[number];
type RecordedMetrics = Record<MetricKey, number>;

type RawWorldSeed = {
  stream_version: number;
  world_id: string;
  graph_revision: number;
  seed: number;
  ruleset_id: string;
  initial_state: WorldState;
  action_ids: readonly WorldCommand["action"][];
};

type RawWorldEvent = {
  stream_version: number;
  event_index_in_commit: number;
  message_id: string;
  world_id: string;
  world_revision: number;
  event_kind: string;
  actor_id: string | null;
  summary: string;
  metrics: RecordedMetrics;
};

type RebuiltWorldGroup = {
  message_ids: string[];
  first_stream_version: number;
  committed_version: number;
  world_revision: number;
  code: "OK" | "CHARACTER_REFUSAL";
};

type RebuiltWorld = {
  state: WorldState;
  groups: RebuiltWorldGroup[];
  action_ids: readonly WorldCommand["action"][];
};

type StreamSnapshot = {
  events: DomainEvent[];
  version: number;
};

type RebuildRequest = {
  experience_id: string;
  expected_identity?: Pick<
    WorldCommand,
    "world_id" | "graph_revision" | "ruleset_id"
  >;
  require_current_graph: boolean;
};

type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: WorldDispatchCode };

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail<T = never>(code: WorldDispatchCode): Result<T> {
  return { ok: false, code };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function equalMetrics(
  left: RecordedMetrics,
  right: RecordedMetrics,
): boolean {
  return METRIC_KEYS.every((key) => left[key] === right[key]);
}

function commandLooksValid(command: WorldCommand): boolean {
  return (
    isNonEmptyString(command.action) &&
    isNonEmptyString(command.experience_id) &&
    isNonEmptyString(command.world_id) &&
    isNonEmptyString(command.ruleset_id) &&
    isNonNegativeSafeInteger(command.graph_revision) &&
    isNonNegativeSafeInteger(command.expected_world_revision)
  );
}

function derivedKeyMatches(input: DispatchWorldActionInput): boolean {
  if (!commandLooksValid(input.command) || !isNonEmptyString(input.turn_id)) {
    return false;
  }
  const expected = deriveWorldActionIdempotencyKey(
    input.turn_id,
    input.command.action as "deepen_specialization" | "expand_market",
    {
      experience_id: input.command.experience_id,
      world_id: input.command.world_id,
      graph_revision: input.command.graph_revision,
      world_revision: input.command.expected_world_revision,
      ruleset_id: input.command.ruleset_id,
    },
  );
  return input.idempotency_key === expected;
}

function readGraphRevision(event: DomainEvent): number | null {
  const payload = event.payload as unknown;
  return validateEventPayload("reader_world.graph.committed.v1", payload).ok &&
    isPlainObject(payload) &&
    isNonNegativeSafeInteger(payload.graph_revision)
    ? payload.graph_revision
    : null;
}

function readWorldSeed(event: DomainEvent): RawWorldSeed | null {
  const payload = event.payload as unknown;
  const isRecipeSeed =
    event.message_name === "reader_world.world.seeded.v2";
  if (
    (event.message_name !== "reader_world.world.seeded.v1" && !isRecipeSeed) ||
    !validateEventPayload(event.message_name, payload).ok ||
    !isPlainObject(payload) ||
    !isNonEmptyString(payload.world_id) ||
    !isNonNegativeSafeInteger(payload.graph_revision) ||
    !Number.isSafeInteger(payload.seed) ||
    !isNonEmptyString(payload.ruleset_id)
  ) {
    return null;
  }

  if (isRecipeSeed) {
    if (
      !isNonEmptyString(payload.recipe_id) ||
      !isNonEmptyString(payload.recipe_fingerprint) ||
      !isPlainObject(payload.normalized_parameters)
    ) {
      return null;
    }
    const compiled = compileReviewedRecipe({
      recipe_id: payload.recipe_id,
      parameters: payload.normalized_parameters,
      seed: payload.seed as number,
      experience_id: event.experience_id,
      world_id: payload.world_id,
      graph_revision: payload.graph_revision,
    });
    if (
      !compiled.ok ||
      compiled.value.recipe_fingerprint !== payload.recipe_fingerprint ||
      compiled.value.definition.initial_state.ruleset_id !== payload.ruleset_id ||
      canonicalize(compiled.value.normalized_parameters) !==
        canonicalize(payload.normalized_parameters)
    ) {
      return null;
    }
    return {
      stream_version: event.stream_version,
      world_id: payload.world_id,
      graph_revision: payload.graph_revision,
      seed: payload.seed as number,
      ruleset_id: payload.ruleset_id,
      initial_state: cloneWorldState(compiled.value.definition.initial_state),
      action_ids: [...compiled.value.definition.action_ids],
    };
  }

  return {
    stream_version: event.stream_version,
    world_id: payload.world_id,
    graph_revision: payload.graph_revision,
    seed: payload.seed as number,
    ruleset_id: payload.ruleset_id,
    initial_state: createWoolTownBaseline({
      experience_id: event.experience_id,
      world_id: payload.world_id,
      graph_revision: payload.graph_revision,
      seed: payload.seed as number,
    }),
    action_ids: LEGACY_WORLD_ACTION_IDS,
  };
}

function readMetrics(
  value: unknown,
): RecordedMetrics | null {
  if (!isPlainObject(value)) return null;
  if (Object.keys(value).length !== METRIC_KEYS.length) return null;
  for (const key of Object.keys(value)) {
    if (!(METRIC_KEYS as readonly string[]).includes(key)) return null;
  }
  const metrics = {} as RecordedMetrics;
  for (const key of METRIC_KEYS) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
      return null;
    }
    metrics[key] = value[key] as number;
  }
  return metrics;
}

function readWorldEvent(event: DomainEvent): RawWorldEvent | null {
  const payload = event.payload as unknown;
  if (
    !validateEventPayload(WORLD_EVENT_NAME, payload).ok ||
    !isPlainObject(payload)
  ) {
    return null;
  }
  if (
    !isNonEmptyString(payload.world_id) ||
    !isNonNegativeSafeInteger(payload.world_revision) ||
    !isNonEmptyString(payload.event_kind) ||
    !isNonEmptyString(payload.summary)
  ) {
    return null;
  }
  if (
    payload.actor_id !== null &&
    !isNonEmptyString(payload.actor_id)
  ) {
    return null;
  }
  const metrics = readMetrics(payload.metrics);
  if (!metrics) return null;
  if (!isNonEmptyString(event.message_id)) return null;
  return {
    stream_version: event.stream_version,
    event_index_in_commit: event.event_index_in_commit,
    message_id: event.message_id,
    world_id: payload.world_id,
    world_revision: payload.world_revision,
    event_kind: payload.event_kind,
    actor_id: payload.actor_id as string | null,
    summary: payload.summary,
    metrics,
  };
}

function normalizeStream(
  experience_id: string,
  raw: readonly DomainEvent[],
): Result<DomainEvent[]> {
  const events = [...raw].sort((left, right) => left.stream_version - right.stream_version);

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (
      event.experience_id !== experience_id ||
      event.stream_version !== index + 1
    ) {
      return fail("INVALID_STATE");
    }
  }
  return ok(events);
}

async function loadSnapshot(
  store: EventStore,
  experience_id: string,
): Promise<Result<StreamSnapshot>> {
  try {
    const loaded = await store.load(experience_id);
    if (!loaded.ok) return fail("TEMPORARY_FAILURE");
    const normalized = normalizeStream(experience_id, loaded.value);
    if (!normalized.ok) return normalized;
    const version = await store.getVersion(experience_id);
    if (!version.ok) return fail("TEMPORARY_FAILURE");
    if (version.value !== normalized.value.length) return fail("STALE");
    return ok({
      events: normalized.value,
      version: version.value,
    });
  } catch {
    return fail("TEMPORARY_FAILURE");
  }
}

function inferredAction(group: readonly RawWorldEvent[]): WorldCommand["action"] | null {
  if (
    group.length === CANONICAL_ACTOR_ORDER.length &&
    group.every(
      (event, index) =>
        event.event_kind === "character_observation" &&
        event.actor_id === CANONICAL_ACTOR_ORDER[index],
    )
  ) {
    return "expand_market";
  }
  if (
    group.length === 1 &&
    group[0]?.actor_id === "weaver" &&
    (group[0].event_kind === "character_refusal" ||
      group[0].event_kind === "character_accept")
  ) {
    return "deepen_specialization";
  }
  return null;
}

function matchesRecordedSpec(recorded: RawWorldEvent, expected: KernelEventSpec): boolean {
  return (
    recorded.event_kind === expected.event_kind &&
    recorded.actor_id === expected.actor_id &&
    recorded.summary === expected.summary &&
    equalMetrics(recorded.metrics, expected.metrics)
  );
}

function rebuildAuthoritativeWorld(
  request: RebuildRequest,
  events: readonly DomainEvent[],
): Result<RebuiltWorld> {
  const worldEvents: RawWorldEvent[] = [];
  const committedGraphRevisions = new Set<number>();
  let latestGraph: { graph_revision: number; stream_version: number } | null = null;
  let seed: RawWorldSeed | null = null;
  let seedHasCommittedGraph = false;

  for (const event of events) {
    switch (event.message_name) {
      case "reader_world.graph.committed.v1": {
        const graph_revision = readGraphRevision(event);
        if (graph_revision === null) return fail("INVALID_STATE");
        committedGraphRevisions.add(graph_revision);
        latestGraph = { graph_revision, stream_version: event.stream_version };
        break;
      }
      case "reader_world.world.seeded.v1":
      case "reader_world.world.seeded.v2": {
        const parsed = readWorldSeed(event);
        if (!parsed) return fail("INVALID_STATE");
        if (seed) return fail("WORLD_NOT_READY");
        seed = parsed;
        seedHasCommittedGraph = committedGraphRevisions.has(seed.graph_revision);
        break;
      }
      case WORLD_EVENT_NAME: {
        const recorded = readWorldEvent(event);
        if (!recorded) return fail("INVALID_STATE");
        worldEvents.push(recorded);
        break;
      }
      default:
        break;
    }
  }

  if (!seed || !seedHasCommittedGraph) return fail("WORLD_NOT_READY");
  const expected = request.expected_identity;
  if (expected && seed.world_id !== expected.world_id) {
    return fail("WORLD_IDENTITY_MISMATCH");
  }
  if (expected && seed.graph_revision !== expected.graph_revision) {
    return fail("GRAPH_REVISION_MISMATCH");
  }
  if (
    seed.ruleset_id !== FROZEN_WOOL_TOWN_RULESET.ruleset_id ||
    (expected && seed.ruleset_id !== expected.ruleset_id)
  ) {
    return fail("RULESET_MISMATCH");
  }
  if (
    request.require_current_graph &&
    (!latestGraph ||
      latestGraph.graph_revision !== seed.graph_revision ||
      latestGraph.stream_version >= seed.stream_version)
  ) {
    return fail("WORLD_NOT_READY");
  }

  let state = cloneWorldState(seed.initial_state);
  const groups: RebuiltWorldGroup[] = [];
  let cursor = 0;

  while (cursor < worldEvents.length) {
    const first = worldEvents[cursor]!;
    if (
      first.stream_version <= seed.stream_version ||
      first.world_id !== seed.world_id
    ) {
      return fail(
        first.world_id !== seed.world_id ? "WORLD_IDENTITY_MISMATCH" : "INVALID_STATE",
      );
    }
    if (first.world_revision !== state.world_revision + 1) {
      return fail("INVALID_STATE");
    }

    const group: RawWorldEvent[] = [];
    while (
      cursor < worldEvents.length &&
      worldEvents[cursor]!.world_revision === first.world_revision
    ) {
      const current = worldEvents[cursor]!;
      if (
        current.world_id !== seed.world_id ||
        current.stream_version !== first.stream_version + group.length ||
        current.event_index_in_commit !== group.length
      ) {
        return fail(
          current.world_id !== seed.world_id ? "WORLD_IDENTITY_MISMATCH" : "INVALID_STATE",
        );
      }
      group.push(current);
      cursor += 1;
    }

    const action = inferredAction(group);
    if (!action) return fail("INVALID_STATE");
    if (!seed.action_ids.includes(action)) return fail("INVALID_STATE");
    const decision = decide(
      state,
      {
        action,
        experience_id: state.experience_id,
        world_id: state.world_id,
        graph_revision: state.graph_revision,
        expected_world_revision: state.world_revision,
        ruleset_id: state.ruleset_id,
      },
      { ruleset: FROZEN_WOOL_TOWN_RULESET, seed: state.seed },
    );
    if (
      !decision.ok ||
      (decision.code !== "OK" && decision.code !== "CHARACTER_REFUSAL") ||
      decision.next_state.world_revision !== first.world_revision ||
      decision.events.length !== group.length ||
      !decision.events.every((spec, index) => matchesRecordedSpec(group[index]!, spec))
    ) {
      return fail("INVALID_STATE");
    }

    state = decision.next_state;
    groups.push({
      message_ids: group.map((record) => record.message_id),
      first_stream_version: group[0]!.stream_version,
      committed_version: group[group.length - 1]!.stream_version,
      world_revision: state.world_revision,
      code: decision.code,
    });
  }

  return ok({ state, groups, action_ids: seed.action_ids });
}

export function stableWorldDispatchMessageId(input: {
  experience_id: string;
  turn_id: string;
  command: WorldCommand;
  index: number;
}): string {
  const part = (value: string | number): string => encodeURIComponent(String(value));
  return [
    MESSAGE_NAMESPACE,
    `experience=${part(input.experience_id)}`,
    `turn=${part(input.turn_id)}`,
    `action=${part(input.command.action)}`,
    `world=${part(input.command.world_id)}`,
    `graph=${part(input.command.graph_revision)}`,
    `world_revision=${part(input.command.expected_world_revision)}`,
    `ruleset=${part(input.command.ruleset_id)}`,
    `index=${part(input.index)}`,
  ].join(":");
}

function expectedDraftInput(
  input: DispatchWorldActionInput,
  spec: KernelEventSpec,
  nextState: WorldState,
  index: number,
): WorldEventDraftFactoryInput {
  return {
    message_name: WORLD_EVENT_NAME,
    experience_id: input.command.experience_id,
    correlation_id: input.idempotency_key,
    causation_id: null,
    producer: { module: "reader_world", instance: "world-dispatch" },
    security: {
      principal_id: input.principal_id,
      authority: "system",
      integrity: "local",
    },
    message_id: stableWorldDispatchMessageId({
      experience_id: input.command.experience_id,
      turn_id: input.turn_id,
      command: input.command,
      index,
    }),
    payload: {
      world_id: input.command.world_id,
      world_revision: nextState.world_revision,
      event_kind: spec.event_kind,
      actor_id: spec.actor_id,
      summary: spec.summary,
      metrics: { ...spec.metrics },
    },
  };
}

async function createDrafts(
  input: DispatchWorldActionInput,
  specs: readonly KernelEventSpec[],
  nextState: WorldState,
): Promise<Result<DomainEventDraft[]>> {
  const drafts: DomainEventDraft[] = [];
  try {
    for (let index = 0; index < specs.length; index += 1) {
      // The injected factory is trusted; EventStore validates the finished draft once.
      drafts.push(
        await input.draft_factory(
          expectedDraftInput(input, specs[index]!, nextState, index),
        ),
      );
    }
  } catch {
    return fail("COMMIT_FAILED");
  }
  return ok(drafts);
}

function receipt(
  code: WorldDispatchCode,
  overrides: Partial<WorldDispatchReceipt> = {},
): WorldDispatchReceipt {
  return {
    ok: false,
    committed: false,
    duplicate: false,
    code,
    world_revision: null,
    event_count: 0,
    committed_version: null,
    message_ids: [],
    ...overrides,
  };
}

async function loadIdempotencyReceipt(
  input: DispatchWorldActionInput,
): Promise<Result<IdempotencyReceipt | null>> {
  try {
    const stored = await input.store.getIdempotencyReceipt(
      input.principal_id,
      input.command.experience_id,
      input.idempotency_key,
    );
    return stored.ok ? ok(stored.value) : fail("TEMPORARY_FAILURE");
  } catch {
    return fail("TEMPORARY_FAILURE");
  }
}

function groupForReceipt(
  stored: IdempotencyReceipt,
  rebuilt: RebuiltWorld,
): RebuiltWorldGroup | null {
  const group = rebuilt.groups.find(
    (candidate) =>
      candidate.message_ids.length === stored.message_ids.length &&
      candidate.message_ids.every((id, index) => id === stored.message_ids[index]),
  );
  if (
    !group ||
    stored.previous_version !== group.first_stream_version - 1 ||
    stored.committed_version !== group.committed_version
  ) {
    return null;
  }
  return group;
}

function committedGroupReceipt(
  group: RebuiltWorldGroup,
  options: { duplicate: boolean },
): WorldDispatchReceipt {
  return receipt(group.code, {
    ok: true,
    committed: true,
    duplicate: options.duplicate,
    world_revision: group.world_revision,
    event_count: group.message_ids.length,
    committed_version: group.committed_version,
    message_ids: [...group.message_ids],
  });
}

function postCommitReceipt(
  code: WorldDispatchCode,
  appended: AppendReceipt,
  world_revision: number,
  event_count: number,
): WorldDispatchReceipt {
  return receipt(code, {
    committed: true,
    world_revision,
    event_count,
    committed_version: appended.committed_version,
    message_ids: [...appended.message_ids],
  });
}

function storageFailure(code: string): WorldDispatchCode {
  if (code === "EXPECTED_VERSION_MISMATCH") return "STALE";
  if (code === "STORE_UNAVAILABLE") return "TEMPORARY_FAILURE";
  return "COMMIT_FAILED";
}

/** Replays the raw stream into the only basis a provider may use for a world turn. */
export async function inspectCurrentWorld(
  input: InspectCurrentWorldInput,
): Promise<CurrentWorldInspection> {
  if (!isNonEmptyString(input.experience_id)) {
    return { ok: false, code: "INVALID_COMMAND" };
  }
  const snapshot = await loadSnapshot(input.store, input.experience_id);
  if (!snapshot.ok) return { ok: false, code: snapshot.code };
  const rebuilt = rebuildAuthoritativeWorld(
    { experience_id: input.experience_id, require_current_graph: true },
    snapshot.value.events,
  );
  if (!rebuilt.ok) return { ok: false, code: rebuilt.code };
  return {
    ok: true,
    world_state: cloneWorldState(rebuilt.value.state),
    last_stream_version: snapshot.value.version,
  };
}

/**
 * Rebuilds the only authoritative WorldState from the raw EventStore stream,
 * runs the pure kernel once, and commits every resulting world event together.
 */
export async function dispatchWorldAction(
  input: DispatchWorldActionInput,
): Promise<WorldDispatchReceipt> {
  if (
    !isNonEmptyString(input.principal_id) ||
    !isNonEmptyString(input.idempotency_key) ||
    !derivedKeyMatches(input)
  ) {
    return receipt("INVALID_COMMAND");
  }

  const storedBefore = await loadIdempotencyReceipt(input);
  if (!storedBefore.ok) return receipt(storedBefore.code);
  const existing = storedBefore.value;

  const snapshot = await loadSnapshot(input.store, input.command.experience_id);
  if (!snapshot.ok) return receipt(snapshot.code);
  const rebuilt = rebuildAuthoritativeWorld({
    experience_id: input.command.experience_id,
    expected_identity: input.command,
    require_current_graph: !existing,
  }, snapshot.value.events);
  if (!rebuilt.ok) return receipt(rebuilt.code);

  if (existing) {
    const group = groupForReceipt(existing, rebuilt.value);
    return group
      ? committedGroupReceipt(group, { duplicate: true })
      : receipt("COMMIT_FAILED");
  }

  if (!rebuilt.value.action_ids.includes(input.command.action)) {
    return receipt("ACTION_UNSUPPORTED");
  }

  const decision = decide(
    rebuilt.value.state,
    input.command,
    {
      ruleset: FROZEN_WOOL_TOWN_RULESET,
      seed: rebuilt.value.state.seed,
    },
  );
  if (!decision.ok) return receipt(decision.code);
  if (decision.events.length === 0) return receipt("COMMIT_FAILED");

  const drafts = await createDrafts(input, decision.events, decision.next_state);
  if (!drafts.ok) return receipt(drafts.code);

  let appended;
  try {
    appended = await input.store.append({
      experience_id: input.command.experience_id,
      principal_id: input.principal_id,
      idempotency_key: input.idempotency_key,
      expected_version: snapshot.value.version || -1,
      events: drafts.value,
    });
  } catch {
    return receipt("TEMPORARY_FAILURE");
  }
  if (!appended.ok) return receipt(storageFailure(appended.error.code));
  const committed = appended.value;

  const afterSnapshot = await loadSnapshot(input.store, input.command.experience_id);
  if (!afterSnapshot.ok) {
    return postCommitReceipt(
      afterSnapshot.code,
      committed,
      decision.next_state.world_revision,
      decision.events.length,
    );
  }
  const afterRebuild = rebuildAuthoritativeWorld({
    experience_id: input.command.experience_id,
    expected_identity: input.command,
    require_current_graph: true,
  }, afterSnapshot.value.events);
  if (!afterRebuild.ok || afterSnapshot.value.version !== committed.committed_version) {
    return postCommitReceipt(
      afterRebuild.ok ? "STALE" : afterRebuild.code,
      committed,
      decision.next_state.world_revision,
      decision.events.length,
    );
  }
  const storedAfter = await loadIdempotencyReceipt(input);
  if (!storedAfter.ok || !storedAfter.value) {
    return postCommitReceipt(
      storedAfter.ok ? "COMMIT_FAILED" : storedAfter.code,
      committed,
      decision.next_state.world_revision,
      decision.events.length,
    );
  }
  const group = groupForReceipt(storedAfter.value, afterRebuild.value);
  if (!group) {
    return postCommitReceipt(
      "COMMIT_FAILED",
      committed,
      decision.next_state.world_revision,
      decision.events.length,
    );
  }
  return committedGroupReceipt(group, { duplicate: committed.duplicate });
}

export function createWorldDispatchPort(
  config: WorldDispatchPortConfig,
): WorldDispatchPort {
  return (request) => dispatchWorldAction({ ...config, ...request });
}
