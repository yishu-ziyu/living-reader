import type { DomainEvent } from "../events";
import { orderEventsForProjection } from "./order-events";
import {
  emptyReadingGraphView,
  type ReadingGraphView,
  type ReadingIdeaView,
  type BookThoughtView,
  type RelationView,
} from "./types";

/**
 * Pure fold of DomainEvents into ReadingGraphView.
 * Does not call models, tools, or WorldKernel.
 * Idempotent under duplicate message_id (keeps first in stream order).
 *
 * T005 derived fields (not event payload):
 * - idea_basis_revision = count of reader_idea.proposed events
 * - relation.proposal_revision = count of proposed events for that relation_id
 * - relation.stale / graph_stale when idea basis advanced past relation basis
 */
export function foldReadingGraph(
  experience_id: string,
  events: readonly DomainEvent[],
): ReadingGraphView {
  const view = emptyReadingGraphView(experience_id);
  const ideas = new Map<string, ReadingIdeaView>();
  const thoughts = new Map<string, BookThoughtView>();
  const relations = new Map<string, RelationView>();
  const proposalCounts = new Map<string, number>();
  let ideaEventCount = 0;

  const ordered = orderEventsForProjection(experience_id, events);

  for (const e of ordered) {
    view.last_stream_version = e.stream_version;
    switch (e.message_name) {
      case "reader_world.reading_session.opened.v1": {
        const p = e.payload;
        view.session_opened = true;
        view.book_id = p.book_id;
        view.book_revision = p.book_revision;
        view.scenario_id = p.scenario_id;
        view.locale = p.locale;
        break;
      }
      case "reader_world.reader_idea.proposed.v1": {
        ideaEventCount += 1;
        const p = e.payload;
        if (p.supersedes) {
          const prev = ideas.get(p.supersedes);
          if (prev) {
            ideas.set(p.supersedes, { ...prev, status: "superseded" });
          }
          for (const [id, idea] of ideas) {
            if (idea.idea_id === p.idea_id && idea.revision < p.revision) {
              ideas.set(id, { ...idea, status: "superseded" });
            }
          }
        }
        const key = `${p.idea_id}@${p.revision}`;
        ideas.set(key, {
          idea_id: p.idea_id,
          idea_kind: p.idea_kind,
          text: p.text,
          source_ids: [...p.source_ids],
          evidence_refs: [...p.evidence_refs],
          revision: p.revision,
          supersedes: p.supersedes,
          status: "active",
        });
        break;
      }
      case "agent_os.book_thought.proposed.v1": {
        const p = e.payload;
        if (p.supersedes) {
          for (const [id, t] of thoughts) {
            if (t.thought_id === p.thought_id && t.revision < p.revision) {
              thoughts.set(id, { ...t, status: "superseded" });
            }
            if (t.thought_id === p.supersedes) {
              thoughts.set(id, { ...t, status: "superseded" });
            }
          }
        }
        const key = `${p.thought_id}@${p.revision}`;
        thoughts.set(key, {
          thought_id: p.thought_id,
          thought_kind: p.thought_kind,
          text: p.text,
          source_ids: [...p.source_ids],
          evidence_refs: [...p.evidence_refs],
          confidence: p.confidence,
          open_question: p.open_question ?? null,
          revision: p.revision,
          supersedes: p.supersedes,
          status: "active",
        });
        break;
      }
      case "reader_world.relation.proposed.v1": {
        const p = e.payload;
        const count = (proposalCounts.get(p.relation_id) ?? 0) + 1;
        proposalCounts.set(p.relation_id, count);
        const prev = relations.get(p.relation_id);
        // F32: review_history is only appended on reviewed events (single source).
        // proposed must not re-copy revised/accepted/rejected or corrections will double.
        const history = [...(prev?.review_history ?? [])];
        relations.set(p.relation_id, {
          relation_id: p.relation_id,
          from_id: p.from_id,
          to_id: p.to_id,
          relation_type: p.relation_type,
          evidence_refs: [...p.evidence_refs],
          basis_revision: p.basis_revision,
          review_status: "proposed",
          // Keep last corrections visible on the card until next review event.
          corrections: prev?.corrections ?? null,
          proposal_revision: count,
          stale: false,
          review_history: history,
        });
        break;
      }
      case "reader_world.relation.reviewed.v1": {
        const p = e.payload;
        const existing = relations.get(p.relation_id);
        if (existing) {
          const history = [
            ...existing.review_history,
            {
              decision: p.decision,
              corrections: p.corrections ?? null,
              basis_revision: p.basis_revision,
              proposal_revision: existing.proposal_revision,
            },
          ];
          relations.set(p.relation_id, {
            ...existing,
            review_status: p.decision,
            corrections: p.corrections ?? null,
            basis_revision: p.basis_revision,
            review_history: history,
          });
        }
        break;
      }
      case "reader_world.graph.committed.v1": {
        const p = e.payload;
        view.graph_revision = p.graph_revision;
        view.accepted_relation_ids = [...p.accepted_relation_ids];
        break;
      }
      default:
        break;
    }
  }

  view.idea_basis_revision = ideaEventCount;

  // Mark stale: relation basis behind current idea event count
  for (const [id, rel] of relations) {
    const stale = ideaEventCount > rel.basis_revision;
    relations.set(id, { ...rel, stale });
  }

  view.ideas = [...ideas.values()].sort((a, b) =>
    a.idea_id === b.idea_id
      ? a.revision - b.revision
      : a.idea_id.localeCompare(b.idea_id),
  );
  view.thoughts = [...thoughts.values()].sort((a, b) =>
    a.thought_id === b.thought_id
      ? a.revision - b.revision
      : a.thought_id.localeCompare(b.thought_id),
  );
  view.relations = [...relations.values()].sort((a, b) =>
    a.relation_id.localeCompare(b.relation_id),
  );

  view.graph_stale =
    view.accepted_relation_ids.length > 0 &&
    view.accepted_relation_ids.some((rid) => {
      const r = relations.get(rid);
      return !r || r.stale || r.review_status !== "accepted";
    });

  return view;
}
