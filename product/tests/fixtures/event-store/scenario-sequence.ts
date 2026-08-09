/**
 * Fixed T003 fixture sequence:
 * Session → 2 ReaderIdea → BookThought → Relation proposed/reviewed →
 * Graph committed → World seeded/event.
 *
 * Lanes and tests must use this shape for rebuild/hash assertions.
 */
import {
  createDomainEventDraft,
  installTestSources,
  type DomainEventDraft,
} from "@/modules/reader-world/events";

export const FIXTURE_EXPERIENCE_ID = "exp_t003_fixture_001";
export const FIXTURE_PRINCIPAL_ID = "principal_reader_test";
export const FIXTURE_CORRELATION_ID = "corr_t003_fixture_001";

const producer = {
  module: "reader_world" as const,
  instance: "test_fixture",
};

const security = {
  principal_id: FIXTURE_PRINCIPAL_ID,
  authority: "reader" as const,
  integrity: "local" as const,
};

/** Build drafts for the full acceptance scenario (IDs deterministic when test sources installed). */
export function buildScenarioDrafts(): DomainEventDraft[] {
  const common = {
    experience_id: FIXTURE_EXPERIENCE_ID,
    correlation_id: FIXTURE_CORRELATION_ID,
    producer,
    security,
  };

  return [
    createDomainEventDraft({
      ...common,
      message_name: "reader_world.reading_session.opened.v1",
      payload: {
        book_id: "book_smith_won",
        book_revision: "cannan_1904_vol1_r1",
        initial_source_id: "smith.b1.c1.division",
        scenario_id: "scenario_division_of_labor",
        locale: "en",
        seed: 42,
      },
    }),
    createDomainEventDraft({
      ...common,
      message_name: "reader_world.reader_idea.proposed.v1",
      payload: {
        idea_id: "idea_1",
        idea_kind: "hypothesis",
        text: "Division of labour raises productivity.",
        source_ids: ["smith.b1.c1.division"],
        evidence_refs: ["ev_pdf_5"],
        revision: 1,
        supersedes: null,
      },
    }),
    createDomainEventDraft({
      ...common,
      message_name: "reader_world.reader_idea.proposed.v1",
      payload: {
        idea_id: "idea_2",
        idea_kind: "question",
        text: "What limits the market extent?",
        source_ids: ["smith.b1.c3.market_extent"],
        evidence_refs: ["ev_pdf_19"],
        revision: 1,
        supersedes: null,
      },
    }),
    createDomainEventDraft({
      ...common,
      message_name: "agent_os.book_thought.proposed.v1",
      payload: {
        thought_id: "thought_1",
        thought_kind: "quote",
        text: "The greatest improvement... seems to have been the effects of the division of labour.",
        source_ids: ["smith.b1.c1.division"],
        evidence_refs: ["ev_pdf_5"],
        confidence: 0.9,
        open_question: null,
        revision: 1,
        supersedes: null,
      },
    }),
    createDomainEventDraft({
      ...common,
      message_name: "reader_world.relation.proposed.v1",
      payload: {
        relation_id: "rel_1",
        from_id: "idea_1",
        to_id: "thought_1",
        relation_type: "supports",
        evidence_refs: ["ev_pdf_5"],
        basis_revision: 0,
      },
    }),
    createDomainEventDraft({
      ...common,
      message_name: "reader_world.relation.reviewed.v1",
      payload: {
        relation_id: "rel_1",
        decision: "accepted",
        corrections: null,
        basis_revision: 0,
      },
    }),
    createDomainEventDraft({
      ...common,
      message_name: "reader_world.graph.committed.v1",
      payload: {
        graph_revision: 1,
        accepted_relation_ids: ["rel_1"],
        basis_graph_revision: 0,
      },
    }),
    createDomainEventDraft({
      ...common,
      message_name: "reader_world.world.seeded.v1",
      payload: {
        world_id: "world_1",
        graph_revision: 1,
        seed: 42,
        ruleset_id: "ruleset_mvp_v1",
      },
    }),
    createDomainEventDraft({
      ...common,
      message_name: "reader_world.world.event_recorded.v1",
      payload: {
        world_id: "world_1",
        world_revision: 1,
        event_kind: "market_opened",
        actor_id: "actor_merchant",
        summary: "Pin factory market opens with seed demand.",
        metrics: { demand: 10, supply: 3 },
      },
    }),
  ];
}

/** Install fixed IDs/clock, return drafts + reset. */
export function withFixedScenarioDrafts(): {
  drafts: DomainEventDraft[];
  reset: () => void;
} {
  const { reset } = installTestSources({
    idPrefix: "msg_fix_",
    fixedTime: "2026-08-08T12:00:00.000Z",
  });
  return { drafts: buildScenarioDrafts(), reset };
}
