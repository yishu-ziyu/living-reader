/**
 * Projection persistence helpers for IndexedDB EventStore.
 * Projections are discardable — rebuild from events must restore identical hashes.
 */

import type { DomainEvent } from "@/modules/reader-world/events/envelope";
import { foldReadingGraph } from "@/modules/reader-world/projections/reading-graph";
import { foldWorld } from "@/modules/reader-world/projections/world";
import type {
  ProjectionCheckpoint,
  ReadingGraphView,
  WorldProjectionView,
} from "@/modules/reader-world/projections/types";
import { semanticViewHashBrowser } from "./browser-hash";
import {
  idbRequest,
  idbTransactionDone,
  PROJECTION_STORES,
  STORE_PROJECTION_APPLIED,
  STORE_PROJECTION_CHECKPOINTS,
  STORE_PROJECTION_READING,
  STORE_PROJECTION_WORLD,
} from "./schema";

export type StoredReadingProjection = {
  experience_id: string;
  view: ReadingGraphView;
  view_hash: string;
};

export type StoredWorldProjection = {
  experience_id: string;
  view: WorldProjectionView;
  view_hash: string;
};

export type LoadedProjections = {
  reading: ReadingGraphView;
  world: WorldProjectionView;
  reading_hash: string;
  world_hash: string;
  reading_checkpoint: ProjectionCheckpoint | null;
  world_checkpoint: ProjectionCheckpoint | null;
};

export type RebuildPersistResult = {
  reading: ReadingGraphView;
  world: WorldProjectionView;
  reading_hash: string;
  world_hash: string;
  reading_checkpoint: ProjectionCheckpoint;
  world_checkpoint: ProjectionCheckpoint;
};

/** Pure rebuild (browser-safe hash) matching projections/rebuild semantics. */
export async function rebuildProjectionsBrowser(
  experience_id: string,
  events: readonly DomainEvent[],
): Promise<RebuildPersistResult> {
  const reading = foldReadingGraph(experience_id, events);
  const world = foldWorld(experience_id, events);
  const reading_hash = await semanticViewHashBrowser(reading);
  const world_hash = await semanticViewHashBrowser(world);
  const projected = Math.max(
    reading.last_stream_version,
    world.last_stream_version,
  );

  return {
    reading,
    world,
    reading_hash,
    world_hash,
    reading_checkpoint: {
      projector_name: "reading_graph",
      experience_id,
      projected_version: projected,
      view_hash: reading_hash,
    },
    world_checkpoint: {
      projector_name: "world",
      experience_id,
      projected_version: projected,
      view_hash: world_hash,
    },
  };
}

/** Persist rebuilt projection views + checkpoints (+ applied markers). */
export async function saveProjections(
  db: IDBDatabase,
  result: RebuildPersistResult,
  events?: readonly DomainEvent[],
): Promise<void> {
  const tx = db.transaction(
    [
      STORE_PROJECTION_READING,
      STORE_PROJECTION_WORLD,
      STORE_PROJECTION_CHECKPOINTS,
      STORE_PROJECTION_APPLIED,
    ],
    "readwrite",
  );

  const readingStore = tx.objectStore(STORE_PROJECTION_READING);
  const worldStore = tx.objectStore(STORE_PROJECTION_WORLD);
  const checkpointStore = tx.objectStore(STORE_PROJECTION_CHECKPOINTS);
  const appliedStore = tx.objectStore(STORE_PROJECTION_APPLIED);

  readingStore.put({
    experience_id: result.reading.experience_id,
    view: result.reading,
    view_hash: result.reading_hash,
  } satisfies StoredReadingProjection);

  worldStore.put({
    experience_id: result.world.experience_id,
    view: result.world,
    view_hash: result.world_hash,
  } satisfies StoredWorldProjection);

  checkpointStore.put(result.reading_checkpoint);
  checkpointStore.put(result.world_checkpoint);

  if (events) {
    for (const e of events) {
      if (e.experience_id !== result.reading.experience_id) continue;
      appliedStore.put({
        projector_name: "reading_graph",
        event_id: e.message_id,
        experience_id: e.experience_id,
        stream_version: e.stream_version,
      });
      appliedStore.put({
        projector_name: "world",
        event_id: e.message_id,
        experience_id: e.experience_id,
        stream_version: e.stream_version,
      });
    }
  }

  await idbTransactionDone(tx);
}

/** Load persisted projections for an experience (null if missing). */
export async function loadProjections(
  db: IDBDatabase,
  experience_id: string,
): Promise<LoadedProjections | null> {
  const tx = db.transaction(
    [
      STORE_PROJECTION_READING,
      STORE_PROJECTION_WORLD,
      STORE_PROJECTION_CHECKPOINTS,
    ],
    "readonly",
  );

  const readingStore = tx.objectStore(STORE_PROJECTION_READING);
  const worldStore = tx.objectStore(STORE_PROJECTION_WORLD);
  const checkpointStore = tx.objectStore(STORE_PROJECTION_CHECKPOINTS);

  const readingRec = (await idbRequest(
    readingStore.get(experience_id),
  )) as StoredReadingProjection | undefined;
  const worldRec = (await idbRequest(
    worldStore.get(experience_id),
  )) as StoredWorldProjection | undefined;
  const readingCp = (await idbRequest(
    checkpointStore.get(["reading_graph", experience_id]),
  )) as ProjectionCheckpoint | undefined;
  const worldCp = (await idbRequest(
    checkpointStore.get(["world", experience_id]),
  )) as ProjectionCheckpoint | undefined;

  await idbTransactionDone(tx);

  if (!readingRec || !worldRec) {
    return null;
  }

  return {
    reading: readingRec.view,
    world: worldRec.view,
    reading_hash: readingRec.view_hash,
    world_hash: worldRec.view_hash,
    reading_checkpoint: readingCp ?? null,
    world_checkpoint: worldCp ?? null,
  };
}

/**
 * Delete projection_* stores only (events + receipts untouched).
 * If experience_id is set, only that experience's projection rows are removed.
 */
export async function clearProjections(
  db: IDBDatabase,
  experience_id?: string,
): Promise<void> {
  const tx = db.transaction([...PROJECTION_STORES], "readwrite");

  if (!experience_id) {
    for (const name of PROJECTION_STORES) {
      tx.objectStore(name).clear();
    }
    await idbTransactionDone(tx);
    return;
  }

  const readingStore = tx.objectStore(STORE_PROJECTION_READING);
  const worldStore = tx.objectStore(STORE_PROJECTION_WORLD);
  const checkpointStore = tx.objectStore(STORE_PROJECTION_CHECKPOINTS);
  const appliedStore = tx.objectStore(STORE_PROJECTION_APPLIED);

  readingStore.delete(experience_id);
  worldStore.delete(experience_id);
  checkpointStore.delete(["reading_graph", experience_id]);
  checkpointStore.delete(["world", experience_id]);

  // applied markers: scan and delete matching experience_id
  const appliedAll = await idbRequest(
    appliedStore.getAll(),
  ) as Array<{
    projector_name: string;
    event_id: string;
    experience_id?: string;
  }>;
  for (const row of appliedAll) {
    if (row.experience_id === experience_id) {
      appliedStore.delete([row.projector_name, row.event_id]);
    }
  }

  await idbTransactionDone(tx);
}

/** Rebuild from events, persist, return hashes. */
export async function rebuildAndPersist(
  db: IDBDatabase,
  experience_id: string,
  events: readonly DomainEvent[],
): Promise<RebuildPersistResult> {
  const result = await rebuildProjectionsBrowser(experience_id, events);
  await saveProjections(db, result, events);
  return result;
}
