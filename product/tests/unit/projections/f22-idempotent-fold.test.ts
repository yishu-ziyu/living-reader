import { describe, expect, it, afterEach } from "vitest";
import { InMemoryEventStore } from "@/infrastructure/event-store/memory";
import {
  applyEventOnce,
  appliedMarkersFromEvents,
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

describe("F22 · Idempotent projection under duplicate delivery", () => {
  afterEach(() => {
    installTestSources().reset();
  });

  it("scenario stream yields stable reading_hash and world_hash", async () => {
    const { events, reset } = await appendScenario();
    try {
      const rebuilt = rebuildProjections(FIXTURE_EXPERIENCE_ID, events);
      expect(rebuilt.reading_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(rebuilt.world_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(rebuilt.reading_hash).toBe(semanticViewHash(rebuilt.reading));
      expect(rebuilt.world_hash).toBe(semanticViewHash(rebuilt.world));
      expect(rebuilt.world.events).toHaveLength(1);
      expect(rebuilt.reading.session_opened).toBe(true);
    } finally {
      reset();
    }
  });

  it("fold(world events twice) keeps same world_hash and events.length === 1", async () => {
    const { events, reset } = await appendScenario();
    try {
      const once = foldWorld(FIXTURE_EXPERIENCE_ID, events);
      const twice = foldWorld(FIXTURE_EXPERIENCE_ID, [...events, ...events]);
      expect(twice.events).toHaveLength(1);
      expect(once.events).toHaveLength(1);
      expect(semanticViewHash(once)).toBe(semanticViewHash(twice));
      expect(twice).toEqual(once);
    } finally {
      reset();
    }
  });

  it("fold(reading events twice) keeps same reading_hash", async () => {
    const { events, reset } = await appendScenario();
    try {
      const once = foldReadingGraph(FIXTURE_EXPERIENCE_ID, events);
      const twice = foldReadingGraph(FIXTURE_EXPERIENCE_ID, [
        ...events,
        ...events,
      ]);
      expect(semanticViewHash(once)).toBe(semanticViewHash(twice));
      expect(twice).toEqual(once);
    } finally {
      reset();
    }
  });

  it("applyEventOnce twice same message_id → second applied=false, hashes equal", async () => {
    const { events, reset } = await appendScenario();
    try {
      const applied = appliedMarkersFromEvents(events.slice(0, -1));
      const last = events[events.length - 1];
      const base = events.slice(0, -1);

      const first = applyEventOnce(
        applied,
        last,
        FIXTURE_EXPERIENCE_ID,
        base,
      );
      expect(first.applied).toBe(true);
      const h1r = semanticViewHash(first.reading);
      const h1w = semanticViewHash(first.world);

      const second = applyEventOnce(
        applied,
        last,
        FIXTURE_EXPERIENCE_ID,
        [...base, last],
      );
      expect(second.applied).toBe(false);
      expect(semanticViewHash(second.reading)).toBe(h1r);
      expect(semanticViewHash(second.world)).toBe(h1w);
    } finally {
      reset();
    }
  });

  it("rebuild twice equal", async () => {
    const { events, reset } = await appendScenario();
    try {
      const a = rebuildProjections(FIXTURE_EXPERIENCE_ID, events);
      const b = rebuildProjections(FIXTURE_EXPERIENCE_ID, events);
      expect(a.reading_hash).toBe(b.reading_hash);
      expect(a.world_hash).toBe(b.world_hash);
      expect(a.reading).toEqual(b.reading);
      expect(a.world).toEqual(b.world);

      // rebuild under duplicated stream delivery still stable
      const dup = rebuildProjections(FIXTURE_EXPERIENCE_ID, [
        ...events,
        ...events,
      ]);
      expect(dup.reading_hash).toBe(a.reading_hash);
      expect(dup.world_hash).toBe(a.world_hash);
      expect(dup.world.events).toHaveLength(1);
    } finally {
      reset();
    }
  });
});
