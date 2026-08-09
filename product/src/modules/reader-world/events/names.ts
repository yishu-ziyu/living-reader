/** Frozen protocol and DomainEvent names. */
export const LEGACY_PROTOCOL_VERSION = "reader-world-protocol/v1" as const;
export const PROTOCOL_VERSION = "reader-world-protocol/v2" as const;

export const DOMAIN_EVENT_NAMES = [
  "reader_world.reading_session.opened.v1",
  "reader_world.reader_idea.proposed.v1",
  "agent_os.book_thought.proposed.v1",
  "reader_world.relation.proposed.v1",
  "reader_world.relation.reviewed.v1",
  "reader_world.graph.committed.v1",
  "reader_world.world.seeded.v1",
  "reader_world.world.seeded.v2",
  "reader_world.world.event_recorded.v1",
  "reader_world.memory.noted.v1",
  "reader_world.memory.retired.v1",
] as const;

export type DomainEventName = (typeof DOMAIN_EVENT_NAMES)[number];

export const DOMAIN_EVENT_NAME_SET = new Set<string>(DOMAIN_EVENT_NAMES);

export function isDomainEventName(name: string): name is DomainEventName {
  return DOMAIN_EVENT_NAME_SET.has(name);
}

/** Event payload schema version is encoded in the allowlisted message name. */
export function schemaVersionForEventName(name: DomainEventName): number {
  return name === "reader_world.world.seeded.v2" ? 2 : 1;
}
