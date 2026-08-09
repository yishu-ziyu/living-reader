import type { DomainEventName } from "./names";

/** Payload types for T003 frozen event set (snake_case). */

export type ReadingSessionOpenedPayload = {
  book_id: string;
  book_revision: string;
  initial_source_id: string;
  scenario_id: string;
  locale: string;
  seed?: number;
};

export type ReaderIdeaProposedPayload = {
  idea_id: string;
  idea_kind: string;
  text: string;
  source_ids: string[];
  evidence_refs: string[];
  revision: number;
  supersedes: string | null;
};

export type BookThoughtProposedPayload = {
  thought_id: string;
  thought_kind: "quote" | "inference" | "experiment" | string;
  text: string;
  source_ids: string[];
  evidence_refs: string[];
  confidence: number;
  open_question?: string | null;
  revision: number;
  supersedes: string | null;
};

export type RelationProposedPayload = {
  relation_id: string;
  from_id: string;
  to_id: string;
  relation_type: string;
  evidence_refs: string[];
  basis_revision: number;
};

export type RelationReviewedPayload = {
  relation_id: string;
  decision: "accepted" | "rejected" | "revised";
  corrections?: string | null;
  basis_revision: number;
};

export type GraphCommittedPayload = {
  graph_revision: number;
  accepted_relation_ids: string[];
  basis_graph_revision: number;
};

export type WorldSeededPayload = {
  world_id: string;
  graph_revision: number;
  seed: number;
  ruleset_id: string;
};

export type NormalizedRecipeParameter = string | number | boolean;

export type WorldSeededV2Payload = WorldSeededPayload & {
  recipe_id: string;
  recipe_fingerprint: string;
  normalized_parameters: Record<string, NormalizedRecipeParameter>;
};

export type WorldEventRecordedPayload = {
  world_id: string;
  world_revision: number;
  event_kind: string;
  actor_id?: string | null;
  summary: string;
  metrics?: Record<string, number | string | boolean>;
};

export type MemoryKind =
  | "read_position"
  | "confusion"
  | "discussion_theme"
  | "idea_ref"
  | "invitation_question";

export type MemoryOrigin = "reader_confirmed" | "agent_observed";

export type MemoryNotedPayload = {
  memory_id: string;
  kind: MemoryKind;
  origin: MemoryOrigin;
  text: string;
  source_locator: string | null;
  reader_idea_id: string | null;
};

export type MemoryRetiredPayload = {
  memory_id: string;
};

export type DomainEventPayloadByName = {
  "reader_world.reading_session.opened.v1": ReadingSessionOpenedPayload;
  "reader_world.reader_idea.proposed.v1": ReaderIdeaProposedPayload;
  "agent_os.book_thought.proposed.v1": BookThoughtProposedPayload;
  "reader_world.relation.proposed.v1": RelationProposedPayload;
  "reader_world.relation.reviewed.v1": RelationReviewedPayload;
  "reader_world.graph.committed.v1": GraphCommittedPayload;
  "reader_world.world.seeded.v1": WorldSeededPayload;
  "reader_world.world.seeded.v2": WorldSeededV2Payload;
  "reader_world.world.event_recorded.v1": WorldEventRecordedPayload;
  "reader_world.memory.noted.v1": MemoryNotedPayload;
  "reader_world.memory.retired.v1": MemoryRetiredPayload;
};

export type DomainEventPayload = DomainEventPayloadByName[DomainEventName];
