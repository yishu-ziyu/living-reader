import { describe, expect, it } from "vitest";
import {
  buildCommittedWorldPresentation,
  type CommittedWorldPresentationInput,
} from "@/modules/world";
import {
  createDomainEventDraft,
  payloadHash,
  type CreateDraftInput,
  type DomainEvent,
  type DomainEventName,
} from "@/modules/reader-world/events";
import {
  initialSessionContext,
  type ReaderSessionContext,
  type SessionStateValue,
} from "@/modules/session";
import type { SourceDiscussionSnapshot } from "@/modules/agent-os";

const EXPERIENCE_ID = "exp_t010_presentation";
const WORLD_ID = "world_t010_wool";
const RELATION_ID = "rel_division_constrained_by_market";
const DIVISION_SOURCE_ID = "smith.b1.c1.division";
const MARKET_SOURCE_ID = "smith.b1.c3.market_extent";
const RULESET_ID = "wool-town-v1";
const RECORDED_AT = "2026-08-09T08:00:00.000Z";

function canonicalMessageId(streamVersion: number): string {
  return `01K25V2J${String(streamVersion).padStart(18, "0")}`;
}

const DIVISION_EVIDENCE = [
  `source:${DIVISION_SOURCE_ID}`,
  "locator:oll:fragment:Smith_0206-01_235",
];
const MARKET_EVIDENCE = [
  `source:${MARKET_SOURCE_ID}`,
  "locator:oll:fragment:Smith_0206-01_426",
];
const RELATION_EVIDENCE = [...DIVISION_EVIDENCE, ...MARKET_EVIDENCE];

const DIVISION_SOURCE: SourceDiscussionSnapshot = {
  source_id: DIVISION_SOURCE_ID,
  quote: "The greatest improvement in the productive powers of labour.",
  fragment: "Smith_0206-01_235",
  pdf_page: 36,
  print_page: 5,
  edition_id: "cannan-1904",
  edition_revision: "oll-v1",
  edition_content_hash: "a".repeat(64),
  source_content_hash: "b".repeat(64),
  evidence_refs: DIVISION_EVIDENCE,
};

const MARKET_SOURCE: SourceDiscussionSnapshot = {
  source_id: MARKET_SOURCE_ID,
  quote: "The division of labour is limited by the extent of the market.",
  fragment: "Smith_0206-01_426",
  pdf_page: 45,
  print_page: 19,
  edition_id: "cannan-1904",
  edition_revision: "oll-v1",
  edition_content_hash: "a".repeat(64),
  source_content_hash: "c".repeat(64),
  evidence_refs: MARKET_EVIDENCE,
};

const producer = { module: "reader_world" as const, instance: "t010-test" };
const security = {
  principal_id: "reader_t010",
  authority: "reader" as const,
  integrity: "local" as const,
};

function stored<N extends DomainEventName>(
  streamVersion: number,
  eventIndexInCommit: number,
  input: CreateDraftInput<N>,
): DomainEvent {
  const draft = createDomainEventDraft(input);
  return {
    ...draft,
    stream_version: streamVersion,
    event_index_in_commit: eventIndexInCommit,
  } as DomainEvent;
}

function committedStream(): DomainEvent[] {
  const common = {
    experience_id: EXPERIENCE_ID,
    correlation_id: "corr_t010",
    recorded_at: RECORDED_AT,
    producer,
    security,
  };

  return [
    stored(1, 0, {
      ...common,
      message_name: "reader_world.reader_idea.proposed.v1",
      message_id: canonicalMessageId(1),
      payload: {
        idea_id: "idea_division",
        idea_kind: "observation",
        text: "分工提高生产率。",
        source_ids: [DIVISION_SOURCE_ID],
        evidence_refs: DIVISION_EVIDENCE,
        revision: 1,
        supersedes: null,
      },
    }),
    stored(2, 0, {
      ...common,
      message_name: "reader_world.reader_idea.proposed.v1",
      message_id: canonicalMessageId(2),
      payload: {
        idea_id: "idea_market",
        idea_kind: "observation",
        text: "市场范围会限制进一步分工。",
        source_ids: [MARKET_SOURCE_ID],
        evidence_refs: MARKET_EVIDENCE,
        revision: 1,
        supersedes: null,
      },
    }),
    stored(3, 0, {
      ...common,
      message_name: "reader_world.relation.proposed.v1",
      message_id: canonicalMessageId(3),
      payload: {
        relation_id: RELATION_ID,
        from_id: "idea_division",
        to_id: "idea_market",
        relation_type: "constrained_by",
        evidence_refs: RELATION_EVIDENCE,
        basis_revision: 2,
      },
    }),
    stored(4, 0, {
      ...common,
      message_name: "reader_world.relation.reviewed.v1",
      message_id: canonicalMessageId(4),
      payload: {
        relation_id: RELATION_ID,
        decision: "accepted",
        corrections: null,
        basis_revision: 2,
      },
    }),
    stored(5, 1, {
      ...common,
      message_name: "reader_world.graph.committed.v1",
      message_id: canonicalMessageId(5),
      causation_id: "relation-accepted",
      payload: {
        graph_revision: 1,
        accepted_relation_ids: [RELATION_ID],
        basis_graph_revision: 0,
      },
    }),
    stored(6, 0, {
      ...common,
      message_name: "reader_world.world.seeded.v1",
      message_id: canonicalMessageId(6),
      payload: {
        world_id: WORLD_ID,
        graph_revision: 1,
        seed: 42,
        ruleset_id: RULESET_ID,
      },
    }),
    ...[
      ["merchant", "merchant:ship:orders_open"],
      ["shepherd", "shepherd:prepare:wool_flow"],
      ["spinner", "spinner:prepare:yarn_flow"],
      ["weaver", "weaver:accept:specialize"],
    ].map(([actor_id, summary], index) =>
      stored(7 + index, index, {
        ...common,
        message_name: "reader_world.world.event_recorded.v1",
        message_id: canonicalMessageId(7 + index),
        payload: {
          world_id: WORLD_ID,
          world_revision: 1,
          event_kind: "character_observation",
          actor_id,
          summary,
          metrics: { supply: 17, inventory: 11, demand: 4, cash: 28 },
        },
      }),
    ),
  ];
}

function playableInput(
  overrides: Partial<ReaderSessionContext> = {},
  state: SessionStateValue = "active.playable",
): CommittedWorldPresentationInput {
  return {
    events: committedStream(),
    sources: [DIVISION_SOURCE, MARKET_SOURCE],
    session: {
      state,
      context: {
        ...initialSessionContext(),
        experience_id: EXPERIENCE_ID,
        source_snapshot_ids: [DIVISION_SOURCE_ID, MARKET_SOURCE_ID],
        source_snapshot_ready: true,
        relation_id: RELATION_ID,
        relation_basis_revision: 2,
        relation_reviewed: true,
        graph_revision: 1,
        graph_committed: true,
        accepted_relation_ids: [RELATION_ID],
        playability_passed: true,
        playability_graph_revision: 1,
        world_id: WORLD_ID,
        world_revision: 0,
        world_basis_graph_revision: 1,
        ...overrides,
      },
    },
  };
}

describe("T010 committed world presentation", () => {
  it("projects a seeded world before its first action", () => {
    const input = playableInput();
    const seedOnly = {
      ...input,
      events: input.events.slice(0, 6),
    };

    const presentation = buildCommittedWorldPresentation(seedOnly);

    expect(presentation).not.toBeNull();
    expect(presentation).toMatchObject({
      basis: {
        world_revision: 0,
        stream_version: 6,
        seeded_stream_version: 6,
      },
      metrics: { supply: 12, inventory: 8, demand: 2, cash: 24 },
      events: [],
      roles: [
        { actor_id: "merchant", observation: null },
        { actor_id: "shepherd", observation: null },
        { actor_id: "spinner", observation: null },
        { actor_id: "weaver", observation: null },
      ],
    });
    expect(presentation?.bindings.evidence.event_message_ids).toEqual([]);
  });

  it("projects only a gated, source-bound raw stream into canonical world facts", () => {
    const presentation = buildCommittedWorldPresentation(playableInput());

    expect(presentation).not.toBeNull();
    if (!presentation) return;

    expect(presentation.basis).toEqual({
      experience_id: EXPERIENCE_ID,
      world_id: WORLD_ID,
      graph_revision: 1,
      world_revision: 1,
      ruleset_id: RULESET_ID,
      seed: 42,
      stream_version: 10,
      seeded_stream_version: 6,
      graph_committed_stream_version: 5,
    });
    expect(presentation.metrics).toEqual({
      supply: 17,
      inventory: 11,
      demand: 4,
      cash: 28,
    });
    expect(presentation.events.map((event) => event.message_id)).toEqual([
      canonicalMessageId(7),
      canonicalMessageId(8),
      canonicalMessageId(9),
      canonicalMessageId(10),
    ]);
    expect(presentation.roles.map((role) => role.actor_id)).toEqual([
      "merchant",
      "shepherd",
      "spinner",
      "weaver",
    ]);
    expect(presentation.roles.map((role) => role.observation?.summary)).toEqual([
      "merchant:ship:orders_open",
      "shepherd:prepare:wool_flow",
      "spinner:prepare:yarn_flow",
      "weaver:accept:specialize",
    ]);
    expect(presentation.bindings.sources).toEqual([
      DIVISION_SOURCE,
      MARKET_SOURCE,
    ]);
    expect(presentation.bindings.relations).toEqual([
      {
        relation_id: RELATION_ID,
        from_id: "idea_division",
        to_id: "idea_market",
        relation_type: "constrained_by",
        evidence_refs: RELATION_EVIDENCE,
        basis_revision: 2,
      },
    ]);
    expect(presentation.bindings.evidence).toEqual({
      source_ids: [DIVISION_SOURCE_ID, MARKET_SOURCE_ID],
      evidence_refs: RELATION_EVIDENCE,
      event_message_ids: [
        canonicalMessageId(7),
        canonicalMessageId(8),
        canonicalMessageId(9),
        canonicalMessageId(10),
      ],
    });
    expect(presentation.model_extension).toEqual({
      label: "MODEL EXTENSION",
      ruleset_id: RULESET_ID,
      seed: 42,
      graph_revision: 1,
    });
  });

  it("does not infer playability from committed world events", () => {
    const presentation = buildCommittedWorldPresentation(
      playableInput({}, "active.reading"),
    );

    expect(presentation).toBeNull();
  });

  it("fails closed when a source/relation binding or stream order is untrustworthy", () => {
    const valid = playableInput();
    const relation = valid.events[2]!;
    if (relation.message_name !== "reader_world.relation.proposed.v1") {
      throw new Error("test fixture must contain relation proposal at stream 3");
    }
    const missingEvidence: CommittedWorldPresentationInput = {
      ...valid,
      events: valid.events.map((event, index) =>
        index === 2
          ? {
              ...relation,
              payload: { ...relation.payload, evidence_refs: [] },
              payload_hash: payloadHash({
                ...relation.payload,
                evidence_refs: [],
              }),
            }
          : event,
      ),
    };

    expect(buildCommittedWorldPresentation(missingEvidence)).toBeNull();

    const mismatchedSource: CommittedWorldPresentationInput = {
      ...valid,
      sources: [
        { ...DIVISION_SOURCE, evidence_refs: [DIVISION_EVIDENCE[0]!] },
        MARKET_SOURCE,
      ],
    };
    expect(buildCommittedWorldPresentation(mismatchedSource)).toBeNull();

    const ordered = playableInput();
    const outOfOrder: CommittedWorldPresentationInput = {
      ...ordered,
      events: ordered.events.map((event, index) =>
        index === 9 ? { ...event, stream_version: 12 } : event,
      ),
    };
    expect(buildCommittedWorldPresentation(outOfOrder)).toBeNull();
  });
});
