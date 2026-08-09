import type { DomainEvent } from "../events";
import { semanticHash } from "../events/hash";
import { foldReadingGraph } from "./reading-graph";
import { foldWorld } from "./world";
import type {
  ProjectionCheckpoint,
  ReadingGraphView,
  WorldProjectionView,
} from "./types";

/** Semantic hash of a projection view (excludes wall-clock fields). */
export function semanticViewHash(view: unknown): string {
  return semanticHash(view);
}

export type RebuildResult = {
  reading: ReadingGraphView;
  world: WorldProjectionView;
  reading_hash: string;
  world_hash: string;
  reading_checkpoint: ProjectionCheckpoint;
  world_checkpoint: ProjectionCheckpoint;
};

/**
 * Rebuild both projections from EventStore stream.
 * Deleting projection stores then calling this must yield identical hashes.
 */
export function rebuildProjections(
  experience_id: string,
  events: readonly DomainEvent[],
): RebuildResult {
  const reading = foldReadingGraph(experience_id, events);
  const world = foldWorld(experience_id, events);
  const reading_hash = semanticViewHash(reading);
  const world_hash = semanticViewHash(world);
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

/**
 * Applied-marker style apply: skip if event_id already applied.
 * Pure in-memory helper for projector concurrency tests.
 */
export function applyEventOnce(
  applied: Set<string>,
  event: DomainEvent,
  experience_id: string,
  currentEvents: DomainEvent[],
): { applied: boolean; reading: ReadingGraphView; world: WorldProjectionView } {
  if (applied.has(event.message_id)) {
    return {
      applied: false,
      reading: foldReadingGraph(experience_id, currentEvents),
      world: foldWorld(experience_id, currentEvents),
    };
  }
  applied.add(event.message_id);
  const next = [...currentEvents, event];
  return {
    applied: true,
    reading: foldReadingGraph(experience_id, next),
    world: foldWorld(experience_id, next),
  };
}
