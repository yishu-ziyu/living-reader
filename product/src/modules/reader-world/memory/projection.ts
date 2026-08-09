import type {
  DomainEvent,
  MemoryKind,
  MemoryOrigin,
} from "../events";
import { orderEventsForProjection } from "../projections/order-events";

export const MAX_RELATIONSHIP_MEMORIES = 12;
export const MAX_MEMORY_TEXT_CHARACTERS = 240;
export const MAX_ACTIVE_RELATIONSHIP_RECIPES = 4;
export const MAX_INVITED_QUESTION_KEYS = 64;

export type MemoryEntry = {
  memory_id: string;
  kind: MemoryKind;
  origin: MemoryOrigin;
  text: string;
  source_locator: string | null;
  reader_idea_id: string | null;
};

export type MemoryProjection = {
  experience_id: string;
  memories: MemoryEntry[];
  retired_memory_ids: string[];
  last_stream_version: number;
};

export type RelationshipMemoryEntry = MemoryEntry & {
  kind: Exclude<MemoryKind, "invitation_question">;
};

export type RelationshipContext = {
  current_chapter_id: string | null;
  memories: RelationshipMemoryEntry[];
  active_recipe_ids: string[];
  invited_question_keys: string[];
};

export type RelationshipContextQuery = {
  current_chapter_id: string | null;
  active_recipe_ids?: readonly string[];
};

type VersionedMemory = MemoryEntry & { stream_version: number };

function cloneEntry<T extends MemoryEntry>(entry: T): T {
  return { ...entry };
}

/** Pure append-only fold. A retire event is a permanent tombstone for its ID. */
export function projectMemory(
  experience_id: string,
  events: readonly DomainEvent[],
): MemoryProjection {
  const entries = new Map<string, VersionedMemory>();
  const retired = new Set<string>();
  let lastStreamVersion = 0;

  for (const event of orderEventsForProjection(experience_id, events)) {
    lastStreamVersion = Math.max(lastStreamVersion, event.stream_version);
    if (event.message_name === "reader_world.memory.retired.v1") {
      retired.add(event.payload.memory_id);
      entries.delete(event.payload.memory_id);
      continue;
    }
    if (event.message_name !== "reader_world.memory.noted.v1") continue;
    const payload = event.payload;
    if (retired.has(payload.memory_id) || entries.has(payload.memory_id)) {
      continue;
    }
    entries.set(payload.memory_id, {
      memory_id: payload.memory_id,
      kind: payload.kind,
      origin: payload.origin,
      text: payload.text,
      source_locator: payload.source_locator,
      reader_idea_id: payload.reader_idea_id,
      stream_version: event.stream_version,
    });
  }

  const memories = [...entries.values()]
    .sort((left, right) => right.stream_version - left.stream_version)
    .map(({ stream_version: _version, ...entry }) => {
      void _version;
      return entry;
    });

  return {
    experience_id,
    memories,
    retired_memory_ids: [...retired],
    last_stream_version: lastStreamVersion,
  };
}

function belongsToChapter(
  sourceLocator: string | null,
  chapterId: string | null,
): boolean {
  if (!sourceLocator || !chapterId) return false;
  return (
    sourceLocator === chapterId || sourceLocator.startsWith(`${chapterId}.`)
  );
}

function isRelationshipMemory(
  entry: MemoryEntry,
): entry is RelationshipMemoryEntry {
  return entry.kind !== "invitation_question";
}

/** Bounded relationship context; origin and text are copied without rewriting. */
export function buildRelationshipContext(
  projection: MemoryProjection,
  query: RelationshipContextQuery,
): RelationshipContext {
  const invitedQuestionKeys = [
    ...new Set(
      projection.memories
        .filter((entry) => entry.kind === "invitation_question")
        .map((entry) => entry.text),
    ),
  ].slice(0, MAX_INVITED_QUESTION_KEYS);
  const ordered = projection.memories
    .filter(isRelationshipMemory)
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftCurrent = belongsToChapter(
        left.entry.source_locator,
        query.current_chapter_id,
      );
      const rightCurrent = belongsToChapter(
        right.entry.source_locator,
        query.current_chapter_id,
      );
      if (leftCurrent !== rightCurrent) return leftCurrent ? -1 : 1;
      return left.index - right.index;
    })
    .slice(0, MAX_RELATIONSHIP_MEMORIES)
    .map(({ entry }) => cloneEntry(entry));

  return {
    current_chapter_id: query.current_chapter_id,
    memories: ordered,
    active_recipe_ids: (query.active_recipe_ids ?? []).slice(
      0,
      MAX_ACTIVE_RELATIONSHIP_RECIPES,
    ),
    invited_question_keys: invitedQuestionKeys,
  };
}
