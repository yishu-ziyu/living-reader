import {
  storeErr,
  storeOk,
  type EventStore,
  type StoreResult,
} from "../event-store";
import type {
  DomainEventDraft,
  DomainEventPayloadByName,
  Producer,
  SecurityContext,
} from "../events";
import { projectMemory, type MemoryProjection } from "./projection";

export type MemoryEventName =
  | "reader_world.memory.noted.v1"
  | "reader_world.memory.retired.v1";

export type MemoryEventDraftInput = {
  [Name in MemoryEventName]: Readonly<{
    message_name: Name;
    message_id: string;
    experience_id: string;
    correlation_id: string;
    causation_id: null;
    recorded_at: string;
    producer: Producer;
    security: SecurityContext;
    payload: DomainEventPayloadByName[Name];
  }>;
}[MemoryEventName];

export type MemoryRuntimePorts = Readonly<{
  next_id: () => string;
  now: () => string;
  create_event_draft: (
    input: MemoryEventDraftInput,
  ) => Promise<DomainEventDraft>;
}>;

export type ChapterMemoryQuery = Readonly<{
  store: EventStore;
  experience_id: string;
  current_chapter_id: string;
  source_ids: readonly string[];
}>;

export type ChapterMemorySnapshot = Readonly<{
  projection: MemoryProjection;
  resume_source_id: string | null;
}>;

export type MemoryWriteInput = ChapterMemoryQuery &
  Readonly<{
    principal_id: string;
    ports: MemoryRuntimePorts;
  }>;

const MEMORY_PRODUCER: Producer = {
  module: "reader_world",
  instance: "chapter-reader-memory",
};

function chapterSnapshot(
  projection: MemoryProjection,
  query: Pick<ChapterMemoryQuery, "current_chapter_id" | "source_ids">,
): ChapterMemorySnapshot {
  const sourceIds = new Set(query.source_ids);
  const currentPrefix = `${query.current_chapter_id}.`;
  const latestPosition = projection.memories.find(
    (entry) =>
      entry.kind === "read_position" &&
      entry.source_locator !== null &&
      entry.source_locator.startsWith(currentPrefix) &&
      sourceIds.has(entry.source_locator),
  );
  return {
    projection,
    resume_source_id: latestPosition?.source_locator ?? null,
  };
}

/** Rebuilds the visible memory view from the append-only EventStore stream. */
export async function loadChapterMemorySnapshot(
  query: ChapterMemoryQuery,
): Promise<StoreResult<ChapterMemorySnapshot>> {
  const loaded = await query.store.load(query.experience_id);
  if (!loaded.ok) return loaded;
  return storeOk(
    chapterSnapshot(
      projectMemory(query.experience_id, loaded.value),
      query,
    ),
  );
}

/**
 * Records one current read position. Replacing a position retires every prior
 * active read-position ID and notes a fresh ID in the same append-only commit.
 */
export async function recordReadPosition(
  input: MemoryWriteInput & Readonly<{ source_id: string }>,
): Promise<StoreResult<ChapterMemorySnapshot>> {
  if (
    !input.source_id.startsWith(`${input.current_chapter_id}.`) ||
    !input.source_ids.includes(input.source_id)
  ) {
    return storeErr("INVALID_PAYLOAD", "read position must use a current canonical source ID");
  }

  const current = await loadChapterMemorySnapshot(input);
  if (!current.ok) return current;
  const activePositions = current.value.projection.memories.filter(
    (entry) => entry.kind === "read_position",
  );
  if (
    activePositions.length === 1 &&
    activePositions[0]!.source_locator === input.source_id
  ) {
    return current;
  }

  const correlationId = input.ports.next_id();
  const recordedAt = input.ports.now();
  const security: SecurityContext = {
    principal_id: input.principal_id,
    authority: "reader",
    integrity: "local",
  };
  const events: DomainEventDraft[] = [];

  for (const position of activePositions) {
    const messageId = input.ports.next_id();
    events.push(
      await input.ports.create_event_draft({
        message_name: "reader_world.memory.retired.v1",
        message_id: messageId,
        experience_id: input.experience_id,
        correlation_id: correlationId,
        causation_id: null,
        recorded_at: recordedAt,
        producer: MEMORY_PRODUCER,
        security,
        payload: { memory_id: position.memory_id },
      }),
    );
  }

  const notedMessageId = input.ports.next_id();
  events.push(
    await input.ports.create_event_draft({
      message_name: "reader_world.memory.noted.v1",
      message_id: notedMessageId,
      experience_id: input.experience_id,
      correlation_id: correlationId,
      causation_id: null,
      recorded_at: recordedAt,
      producer: MEMORY_PRODUCER,
      security,
      payload: {
        memory_id: `read-position:${notedMessageId}`,
        kind: "read_position",
        origin: "reader_confirmed",
        text: `上次读到 ${input.source_id}`,
        source_locator: input.source_id,
        reader_idea_id: null,
      },
    }),
  );

  const appended = await input.store.append({
    experience_id: input.experience_id,
    principal_id: input.principal_id,
    idempotency_key: `memory.read-position:${notedMessageId}`,
    expected_version:
      current.value.projection.last_stream_version === 0
        ? -1
        : current.value.projection.last_stream_version,
    events,
  });
  if (!appended.ok) return appended;
  return loadChapterMemorySnapshot(input);
}

function hasInvitationQuestion(
  projection: MemoryProjection,
  questionKey: string,
): boolean {
  return projection.memories.some(
    (memory) =>
      memory.kind === "invitation_question" && memory.text === questionKey,
  );
}

async function loadMemoryProjection(
  store: EventStore,
  experienceId: string,
): Promise<StoreResult<MemoryProjection>> {
  const loaded = await store.load(experienceId);
  return loaded.ok
    ? storeOk(projectMemory(experienceId, loaded.value))
    : loaded;
}

export async function recordInvitationQuestion(
  input: Readonly<{
    store: EventStore;
    experience_id: string;
    principal_id: string;
    question_key: string;
    source_id: string;
    ports: MemoryRuntimePorts;
  }>,
): Promise<StoreResult<MemoryProjection>> {
  if (!input.question_key.trim() || [...input.question_key].length > 240) {
    return storeErr(
      "INVALID_PAYLOAD",
      "invitation question key must be non-empty and at most 240 characters",
    );
  }
  let current = await loadMemoryProjection(input.store, input.experience_id);
  if (!current.ok || hasInvitationQuestion(current.value, input.question_key)) {
    return current;
  }

  const messageId = input.ports.next_id();
  const draft = await input.ports.create_event_draft({
    message_name: "reader_world.memory.noted.v1",
    message_id: messageId,
    experience_id: input.experience_id,
    correlation_id: input.ports.next_id(),
    causation_id: null,
    recorded_at: input.ports.now(),
    producer: MEMORY_PRODUCER,
    security: {
      principal_id: input.principal_id,
      authority: "system",
      integrity: "local",
    },
    payload: {
      memory_id: `invitation-question:${input.question_key}`,
      kind: "invitation_question",
      origin: "agent_observed",
      text: input.question_key,
      source_locator: input.source_id,
      reader_idea_id: null,
    },
  });
  const appendAt = (projection: MemoryProjection) =>
    input.store.append({
      experience_id: input.experience_id,
      principal_id: input.principal_id,
      idempotency_key: `memory.invitation-question:${input.question_key}`,
      expected_version:
        projection.last_stream_version === 0 ? -1 : projection.last_stream_version,
      events: [draft],
    });

  let appended = await appendAt(current.value);
  if (!appended.ok && appended.error.code === "EXPECTED_VERSION_MISMATCH") {
    current = await loadMemoryProjection(input.store, input.experience_id);
    if (!current.ok || hasInvitationQuestion(current.value, input.question_key)) {
      return current;
    }
    appended = await appendAt(current.value);
  }
  if (!appended.ok) {
    if (
      appended.error.code === "EXPECTED_VERSION_MISMATCH" ||
      appended.error.code === "IDEMPOTENCY_KEY_REUSED"
    ) {
      const concurrent = await loadMemoryProjection(
        input.store,
        input.experience_id,
      );
      if (
        concurrent.ok &&
        hasInvitationQuestion(concurrent.value, input.question_key)
      ) {
        return concurrent;
      }
    }
    return appended;
  }
  return loadMemoryProjection(input.store, input.experience_id);
}

/** Appends a permanent tombstone; no historical event is mutated or removed. */
export async function retireMemory(
  input: MemoryWriteInput & Readonly<{ memory_id: string }>,
): Promise<StoreResult<ChapterMemorySnapshot>> {
  const current = await loadChapterMemorySnapshot(input);
  if (!current.ok) return current;
  const isActive = current.value.projection.memories.some(
    (entry) => entry.memory_id === input.memory_id,
  );
  if (!isActive) return current;

  const correlationId = input.ports.next_id();
  const messageId = input.ports.next_id();
  const draft = await input.ports.create_event_draft({
    message_name: "reader_world.memory.retired.v1",
    message_id: messageId,
    experience_id: input.experience_id,
    correlation_id: correlationId,
    causation_id: null,
    recorded_at: input.ports.now(),
    producer: MEMORY_PRODUCER,
    security: {
      principal_id: input.principal_id,
      authority: "reader",
      integrity: "local",
    },
    payload: { memory_id: input.memory_id },
  });
  const appended = await input.store.append({
    experience_id: input.experience_id,
    principal_id: input.principal_id,
    idempotency_key: `memory.retired:${messageId}`,
    expected_version:
      current.value.projection.last_stream_version === 0
        ? -1
        : current.value.projection.last_stream_version,
    events: [draft],
  });
  if (!appended.ok) return appended;
  return loadChapterMemorySnapshot(input);
}
