/**
 * Projection view types (read-only, discardable).
 * Not a source of truth — rebuild from EventStore stream.
 */

export type ProjectionCheckpoint = {
  projector_name: "reading_graph" | "world";
  experience_id: string;
  projected_version: number;
  /** Canonical semantic hash of the view (excludes recorded_at). */
  view_hash: string;
};

export type ReadingIdeaView = {
  idea_id: string;
  idea_kind: string;
  text: string;
  source_ids: string[];
  evidence_refs: string[];
  revision: number;
  supersedes: string | null;
  status: "active" | "superseded";
};

export type BookThoughtView = {
  thought_id: string;
  thought_kind: string;
  text: string;
  source_ids: string[];
  evidence_refs: string[];
  confidence: number;
  open_question: string | null;
  revision: number;
  supersedes: string | null;
  status: "active" | "superseded";
};

export type RelationReviewHistoryEntry = {
  decision: "accepted" | "rejected" | "revised" | "proposed";
  corrections: string | null;
  basis_revision: number;
  proposal_revision: number;
};

export type RelationView = {
  relation_id: string;
  from_id: string;
  to_id: string;
  relation_type: string;
  evidence_refs: string[];
  basis_revision: number;
  review_status: "proposed" | "accepted" | "rejected" | "revised";
  corrections: string | null;
  /** Count of proposed events for this relation_id (T005 lineage). */
  proposal_revision: number;
  /** True when idea_basis_revision advanced past this relation's basis. */
  stale: boolean;
  /** Append-only review lineage (survives subsequent proposed). */
  review_history: RelationReviewHistoryEntry[];
};

export type ReadingGraphView = {
  experience_id: string;
  book_id: string | null;
  book_revision: string | null;
  scenario_id: string | null;
  locale: string | null;
  session_opened: boolean;
  ideas: ReadingIdeaView[];
  thoughts: BookThoughtView[];
  relations: RelationView[];
  graph_revision: number;
  accepted_relation_ids: string[];
  last_stream_version: number;
  /**
   * T005: count of reader_world.reader_idea.proposed.v1 events in stream.
   * Used as basis_revision when proposing relations.
   */
  idea_basis_revision: number;
  /** True when any accepted relation is stale vs current idea basis. */
  graph_stale: boolean;
};

export type WorldEventView = {
  world_revision: number;
  event_kind: string;
  actor_id: string | null;
  summary: string;
  metrics: Record<string, number | string | boolean>;
};

export type WorldProjectionView = {
  experience_id: string;
  world_id: string | null;
  seeded: boolean;
  seed: number | null;
  ruleset_id: string | null;
  graph_revision: number | null;
  events: WorldEventView[];
  last_stream_version: number;
};

export function emptyReadingGraphView(experience_id: string): ReadingGraphView {
  return {
    experience_id,
    book_id: null,
    book_revision: null,
    scenario_id: null,
    locale: null,
    session_opened: false,
    ideas: [],
    thoughts: [],
    relations: [],
    graph_revision: 0,
    accepted_relation_ids: [],
    last_stream_version: 0,
    idea_basis_revision: 0,
    graph_stale: false,
  };
}

export function emptyWorldProjectionView(
  experience_id: string,
): WorldProjectionView {
  return {
    experience_id,
    world_id: null,
    seeded: false,
    seed: null,
    ruleset_id: null,
    graph_revision: null,
    events: [],
    last_stream_version: 0,
  };
}
