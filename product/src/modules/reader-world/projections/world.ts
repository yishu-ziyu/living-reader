import type { DomainEvent } from "../events";
import { orderEventsForProjection } from "./order-events";
import {
  emptyWorldProjectionView,
  type WorldEventView,
  type WorldProjectionView,
} from "./types";

/**
 * Pure fold of DomainEvents into WorldProjectionView.
 * Does not call WorldKernel — only records seeded facts and world events.
 * Idempotent under duplicate message_id (keeps first in stream order).
 */
export function foldWorld(
  experience_id: string,
  events: readonly DomainEvent[],
): WorldProjectionView {
  const view = emptyWorldProjectionView(experience_id);
  const worldEvents: WorldEventView[] = [];

  const ordered = orderEventsForProjection(experience_id, events);

  for (const e of ordered) {
    view.last_stream_version = e.stream_version;
    switch (e.message_name) {
      case "reader_world.world.seeded.v1": {
        const p = e.payload;
        view.seeded = true;
        view.world_id = p.world_id;
        view.seed = p.seed;
        view.ruleset_id = p.ruleset_id;
        view.graph_revision = p.graph_revision;
        break;
      }
      case "reader_world.world.event_recorded.v1": {
        const p = e.payload;
        worldEvents.push({
          world_revision: p.world_revision,
          event_kind: p.event_kind,
          actor_id: p.actor_id ?? null,
          summary: p.summary,
          metrics: p.metrics ? { ...p.metrics } : {},
        });
        break;
      }
      default:
        break;
    }
  }

  view.events = worldEvents;
  return view;
}
