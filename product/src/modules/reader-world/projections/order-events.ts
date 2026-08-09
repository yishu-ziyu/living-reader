import type { DomainEvent } from "../events";

/**
 * Filter to experience, order by stream_version then event_index_in_commit,
 * keep first occurrence of each message_id (idempotent fold under redelivery).
 */
export function orderEventsForProjection(
  experience_id: string,
  events: readonly DomainEvent[],
): DomainEvent[] {
  const ordered = [...events]
    .filter((e) => e.experience_id === experience_id)
    .sort((a, b) => {
      if (a.stream_version !== b.stream_version) {
        return a.stream_version - b.stream_version;
      }
      return a.event_index_in_commit - b.event_index_in_commit;
    });

  const seen = new Set<string>();
  const unique: DomainEvent[] = [];
  for (const e of ordered) {
    if (seen.has(e.message_id)) continue;
    seen.add(e.message_id);
    unique.push(e);
  }
  return unique;
}

/** Applied-marker set derived from a stream (message_id keys). */
export function appliedMarkersFromEvents(
  events: readonly DomainEvent[],
): Set<string> {
  return new Set(events.map((e) => e.message_id));
}
