import { describe, expect, it, afterEach } from "vitest";
import { InMemoryEventStore } from "@/infrastructure/event-store/memory";
import {
  foldReadingGraph,
  foldWorld,
  rebuildProjections,
  semanticViewHash,
} from "@/modules/reader-world/projections";
import {
  createDomainEventDraft,
  installTestSources,
} from "@/modules/reader-world/events";
import { compileReviewedRecipe } from "@/modules/world";
import {
  FIXTURE_EXPERIENCE_ID,
  FIXTURE_PRINCIPAL_ID,
  withFixedScenarioDrafts,
} from "../../fixtures/event-store/scenario-sequence";

async function appendScenario() {
  const store = new InMemoryEventStore();
  const { drafts, reset } = withFixedScenarioDrafts();
  let expected = -1;
  for (let i = 0; i < drafts.length; i++) {
    const res = await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: `sc-${i}`,
      expected_version: expected,
      events: [drafts[i]],
    });
    if (!res.ok) throw new Error(res.error.message);
    expected = res.value.committed_version;
  }
  const loaded = await store.load(FIXTURE_EXPERIENCE_ID);
  if (!loaded.ok) throw new Error(loaded.error.message);
  return { store, events: loaded.value, reset };
}

describe("ReadingGraph + World projections", () => {
  afterEach(() => {
    installTestSources().reset();
  });

  it("folds scenario into reading and world views", async () => {
    const { events, reset } = await appendScenario();
    try {
      const reading = foldReadingGraph(FIXTURE_EXPERIENCE_ID, events);
      expect(reading.session_opened).toBe(true);
      expect(reading.book_id).toBe("book_smith_won");
      expect(reading.ideas).toHaveLength(2);
      expect(reading.thoughts).toHaveLength(1);
      expect(reading.relations).toHaveLength(1);
      expect(reading.relations[0].review_status).toBe("accepted");
      expect(reading.graph_revision).toBe(1);
      expect(reading.accepted_relation_ids).toEqual(["rel_1"]);
      expect(reading.last_stream_version).toBe(events.length);

      const world = foldWorld(FIXTURE_EXPERIENCE_ID, events);
      expect(world.seeded).toBe(true);
      expect(world.world_id).toBe("world_1");
      expect(world.seed).toBe(42);
      expect(world.events).toHaveLength(1);
      expect(world.events[0].event_kind).toBe("market_opened");
      expect(world.last_stream_version).toBe(events.length);
    } finally {
      reset();
    }
  });

  it("rebuild yields identical canonical hashes", async () => {
    const { events, reset } = await appendScenario();
    try {
      const first = rebuildProjections(FIXTURE_EXPERIENCE_ID, events);
      const second = rebuildProjections(FIXTURE_EXPERIENCE_ID, events);
      expect(first.reading_hash).toBe(second.reading_hash);
      expect(first.world_hash).toBe(second.world_hash);
      expect(first.reading_checkpoint.projected_version).toBe(events.length);
      expect(first.world_checkpoint.projected_version).toBe(events.length);
      expect(first.reading_hash).toBe(
        semanticViewHash(first.reading),
      );
      expect(first.world_hash).toBe(semanticViewHash(first.world));
    } finally {
      reset();
    }
  });

  it("rebuilds the canonical v2 seed and its action events after projections are cleared", async () => {
    const experienceId = "exp_world_projection_v2";
    const principalId = "principal_world_projection_v2";
    const recordedAt = "2026-08-10T10:00:00.000Z";
    const worldId = "world_smith_b1_market_extent_v1_g2";
    const compiled = compileReviewedRecipe({
      recipe_id: "smith.b1.market-extent.v1",
      seed: 42,
      experience_id: experienceId,
      world_id: worldId,
      graph_revision: 2,
    });
    if (!compiled.ok) throw new Error(compiled.code);
    const store = new InMemoryEventStore();
    const seed = createDomainEventDraft({
      message_name: "reader_world.world.seeded.v2",
      message_id: "01K25V2J000000000000000020",
      experience_id: experienceId,
      correlation_id: "corr_world_projection_v2",
      causation_id: null,
      producer: { module: "reader_world", instance: "projection-regression" },
      security: {
        principal_id: principalId,
        authority: "system",
        integrity: "local",
      },
      recorded_at: recordedAt,
      payload: {
        world_id: worldId,
        graph_revision: 2,
        seed: 42,
        ruleset_id: compiled.value.definition.ruleset.ruleset_id,
        recipe_id: "smith.b1.market-extent.v1",
        recipe_fingerprint: compiled.value.recipe_fingerprint,
        normalized_parameters: compiled.value.normalized_parameters,
      },
    });
    const seeded = await store.append({
      experience_id: experienceId,
      principal_id: principalId,
      idempotency_key: "projection-v2-seed",
      expected_version: -1,
      events: [seed],
    });
    if (!seeded.ok) throw seeded.error;

    const action = createDomainEventDraft({
      message_name: "reader_world.world.event_recorded.v1",
      message_id: "01K25V2J000000000000000021",
      experience_id: experienceId,
      correlation_id: "corr_world_projection_v2_action",
      causation_id: seed.message_id,
      producer: { module: "reader_world", instance: "projection-regression" },
      security: {
        principal_id: principalId,
        authority: "system",
        integrity: "local",
      },
      recorded_at: recordedAt,
      payload: {
        world_id: worldId,
        world_revision: 1,
        event_kind: "character_observation",
        actor_id: "merchant",
        summary: "扩大市场后，商人接到更多订单。",
        metrics: { supply: 17, inventory: 11, demand: 4, cash: 32 },
      },
    });
    const acted = await store.append({
      experience_id: experienceId,
      principal_id: principalId,
      idempotency_key: "projection-v2-action",
      expected_version: seeded.value.committed_version,
      events: [action],
    });
    if (!acted.ok) throw acted.error;
    const loaded = await store.load(experienceId);
    if (!loaded.ok) throw loaded.error;

    const beforeClear = rebuildProjections(experienceId, loaded.value);
    expect(beforeClear.world).toMatchObject({
      seeded: true,
      world_id: worldId,
      seed: 42,
      ruleset_id: "wool-town-v1",
      graph_revision: 2,
      last_stream_version: 2,
      events: [
        expect.objectContaining({
          world_revision: 1,
          event_kind: "character_observation",
          actor_id: "merchant",
        }),
      ],
    });

    const cleared = foldWorld(experienceId, []);
    expect(cleared.seeded).toBe(false);
    const rebuilt = rebuildProjections(experienceId, loaded.value);
    expect(rebuilt.world).toEqual(beforeClear.world);
    expect(rebuilt.world_hash).toBe(beforeClear.world_hash);
  });

  it("re-applying same events is no-op for hash", async () => {
    const { events, reset } = await appendScenario();
    try {
      const a = foldReadingGraph(FIXTURE_EXPERIENCE_ID, events);
      const b = foldReadingGraph(FIXTURE_EXPERIENCE_ID, [...events, ...events]);
      expect(semanticViewHash(a)).toBe(semanticViewHash(b));
      expect(b.ideas).toHaveLength(a.ideas.length);
      expect(b.last_stream_version).toBe(a.last_stream_version);

      const wa = foldWorld(FIXTURE_EXPERIENCE_ID, events);
      const wb = foldWorld(FIXTURE_EXPERIENCE_ID, [...events, ...events]);
      expect(semanticViewHash(wa)).toBe(semanticViewHash(wb));
      expect(wb.events).toHaveLength(wa.events.length);
      expect(wb.events).toHaveLength(1);
    } finally {
      reset();
    }
  });

  it("idea supersedes marks prior as superseded", async () => {
    const { events, reset } = await appendScenario();
    try {
      const store = new InMemoryEventStore();
      // re-open path tested via fold only with extra event
      const base = events;
      const supersede = {
        ...base[1],
        message_id: "01K25V2J000000000000000022",
        stream_version: base.length + 1,
        event_index_in_commit: 0,
        payload: {
          idea_id: "idea_1",
          idea_kind: "hypothesis",
          text: "Revised: division raises output under market extent.",
          source_ids: ["smith.b1.c1.division"],
          evidence_refs: ["ev_pdf_5"],
          revision: 2,
          supersedes: "idea_1",
        },
        payload_hash: "x",
        message_name: "reader_world.reader_idea.proposed.v1" as const,
      };
      // payload_hash will be recomputed by semantic hash of view only
      const { payloadHash } = await import("@/modules/reader-world/events");
      supersede.payload_hash = payloadHash(supersede.payload);
      const reading = foldReadingGraph(FIXTURE_EXPERIENCE_ID, [
        ...base,
        supersede,
      ]);
      const active = reading.ideas.filter((i) => i.status === "active");
      const superseded = reading.ideas.filter((i) => i.status === "superseded");
      expect(active.some((i) => i.revision === 2)).toBe(true);
      expect(superseded.length).toBeGreaterThanOrEqual(1);
      void store;
    } finally {
      reset();
    }
  });
});
