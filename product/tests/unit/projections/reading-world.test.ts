import { describe, expect, it, afterEach } from "vitest";
import { InMemoryEventStore } from "@/infrastructure/event-store/memory";
import {
  foldReadingGraph,
  foldWorld,
  rebuildProjections,
  semanticViewHash,
} from "@/modules/reader-world/projections";
import { installTestSources } from "@/modules/reader-world/events";
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
        message_id: "msg_super",
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
