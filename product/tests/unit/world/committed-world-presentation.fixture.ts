import type { CommittedWorldPresentation } from "@/modules/world";

export function committedWorldPresentationFixture(): CommittedWorldPresentation {
  const events = [
    {
      message_name: "reader_world.world.event_recorded.v1" as const,
      message_id: "world-event-merchant",
      stream_version: 7,
      event_index_in_commit: 0,
      world_revision: 1,
      event_kind: "character_observation",
      actor_id: "merchant" as const,
      summary: "merchant:ship:orders_open",
      metrics: { supply: 17, inventory: 11, demand: 4, cash: 28 },
    },
    {
      message_name: "reader_world.world.event_recorded.v1" as const,
      message_id: "world-event-shepherd",
      stream_version: 8,
      event_index_in_commit: 1,
      world_revision: 1,
      event_kind: "character_observation",
      actor_id: "shepherd" as const,
      summary: "shepherd:prepare:wool_flow",
      metrics: { supply: 17, inventory: 11, demand: 4, cash: 28 },
    },
    {
      message_name: "reader_world.world.event_recorded.v1" as const,
      message_id: "world-event-spinner",
      stream_version: 9,
      event_index_in_commit: 2,
      world_revision: 1,
      event_kind: "character_observation",
      actor_id: "spinner" as const,
      summary: "spinner:prepare:yarn_flow",
      metrics: { supply: 17, inventory: 11, demand: 4, cash: 28 },
    },
    {
      message_name: "reader_world.world.event_recorded.v1" as const,
      message_id: "world-event-weaver",
      stream_version: 10,
      event_index_in_commit: 3,
      world_revision: 1,
      event_kind: "character_observation",
      actor_id: "weaver" as const,
      summary: "weaver:accept:specialize",
      metrics: { supply: 17, inventory: 11, demand: 4, cash: 28 },
    },
  ];

  return {
    basis: {
      experience_id: "exp_t010_component",
      world_id: "world_t010_component",
      graph_revision: 1,
      world_revision: 1,
      ruleset_id: "wool-town-v1",
      seed: 42,
      stream_version: 10,
      seeded_stream_version: 6,
      graph_committed_stream_version: 5,
    },
    metrics: { supply: 17, inventory: 11, demand: 4, cash: 28 },
    events,
    roles: [
      { actor_id: "merchant", observation: events[0]! },
      { actor_id: "shepherd", observation: events[1]! },
      { actor_id: "spinner", observation: events[2]! },
      { actor_id: "weaver", observation: events[3]! },
    ],
    bindings: {
      sources: [
        {
          source_id: "smith.b1.c1.division",
          quote: "The greatest improvements in the productive powers of labour.",
          fragment: "Smith_0206-01_235",
          pdf_page: 36,
          print_page: 5,
          edition_id: "oll-cannan-vol-1",
          edition_revision: "2026-08-09",
          edition_content_hash: "a".repeat(64),
          source_content_hash: "b".repeat(64),
          evidence_refs: [
            "source:smith.b1.c1.division",
            "locator:oll:fragment:Smith_0206-01_235",
          ],
        },
        {
          source_id: "smith.b1.c3.market_extent",
          quote: "The division of labour is limited by the extent of the market.",
          fragment: "Smith_0206-01_426",
          pdf_page: 45,
          print_page: 19,
          edition_id: "oll-cannan-vol-1",
          edition_revision: "2026-08-09",
          edition_content_hash: "a".repeat(64),
          source_content_hash: "c".repeat(64),
          evidence_refs: [
            "source:smith.b1.c3.market_extent",
            "locator:oll:fragment:Smith_0206-01_426",
          ],
        },
      ],
      relations: [
        {
          relation_id: "rel_division_constrained_by_market",
          from_id: "idea_division",
          to_id: "idea_market",
          relation_type: "constrained_by",
          evidence_refs: [
            "source:smith.b1.c1.division",
            "source:smith.b1.c3.market_extent",
          ],
          basis_revision: 2,
        },
      ],
      evidence: {
        source_ids: [
          "smith.b1.c1.division",
          "smith.b1.c3.market_extent",
        ],
        evidence_refs: [
          "source:smith.b1.c1.division",
          "locator:oll:fragment:Smith_0206-01_235",
          "source:smith.b1.c3.market_extent",
          "locator:oll:fragment:Smith_0206-01_426",
        ],
        event_message_ids: events.map((event) => event.message_id),
      },
    },
    model_extension: {
      label: "MODEL EXTENSION",
      ruleset_id: "wool-town-v1",
      seed: 42,
      graph_revision: 1,
    },
  };
}
