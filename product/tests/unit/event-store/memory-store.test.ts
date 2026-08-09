import { describe, expect, it, afterEach } from "vitest";
import { InMemoryEventStore } from "@/infrastructure/event-store/memory";
import {
  createDomainEventDraft,
  installTestSources,
  payloadHash,
} from "@/modules/reader-world/events";
import {
  FIXTURE_EXPERIENCE_ID,
  FIXTURE_PRINCIPAL_ID,
  withFixedScenarioDrafts,
} from "../../fixtures/event-store/scenario-sequence";

const security = {
  principal_id: FIXTURE_PRINCIPAL_ID,
  authority: "reader" as const,
  integrity: "local" as const,
};
const producer = { module: "reader_world" as const, instance: "unit" };

function sessionDraft(exp = FIXTURE_EXPERIENCE_ID) {
  return createDomainEventDraft({
    message_name: "reader_world.reading_session.opened.v1",
    experience_id: exp,
    correlation_id: "corr_unit",
    producer,
    security,
    payload: {
      book_id: "book",
      book_revision: "r1",
      initial_source_id: "s1",
      scenario_id: "sc",
      locale: "en",
    },
  });
}

describe("InMemoryEventStore", () => {
  afterEach(() => {
    installTestSources().reset();
  });

  it("appends with expected_version -1 and returns committed_version 1", async () => {
    const store = new InMemoryEventStore();
    const draft = sessionDraft();
    const res = await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "open-1",
      expected_version: -1,
      events: [draft],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.duplicate).toBe(false);
    expect(res.value.previous_version).toBe(-1);
    expect(res.value.committed_version).toBe(1);
    expect(res.value.message_ids).toEqual([draft.message_id]);

    const loaded = await store.load(FIXTURE_EXPERIENCE_ID);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value).toHaveLength(1);
    expect(loaded.value[0].stream_version).toBe(1);
    expect(loaded.value[0].event_index_in_commit).toBe(0);
  });

  it("same key + same payload returns duplicate receipt", async () => {
    const store = new InMemoryEventStore();
    const draft = sessionDraft();
    const req = {
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "open-dup",
      expected_version: -1,
      events: [draft],
    };
    const first = await store.append(req);
    const second = await store.append(req);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.duplicate).toBe(true);
    expect(second.value.committed_version).toBe(first.value.committed_version);
    expect(second.value.message_ids).toEqual(first.value.message_ids);
    expect(second.value.previous_version).toBe(-1);
    expect(second.value.previous_version).toBe(first.value.previous_version);
    expect(second.value.payload_hashes).toEqual(first.value.payload_hashes);
    expect(second.value.payload_hashes[0]).toMatch(/^[a-f0-9]{64}$/);
    const ver = await store.getVersion(FIXTURE_EXPERIENCE_ID);
    expect(ver.ok && ver.value).toBe(1);
  });

  it("same key + different payload → IDEMPOTENCY_KEY_REUSED", async () => {
    const store = new InMemoryEventStore();
    const d1 = sessionDraft();
    const d2 = sessionDraft();
    d2.payload = { ...d2.payload, book_id: "other_book" };
    d2.payload_hash = payloadHash(d2.payload);

    await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "open-reuse",
      expected_version: -1,
      events: [d1],
    });
    const bad = await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "open-reuse",
      expected_version: 1,
      events: [d2],
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    const ver = await store.getVersion(FIXTURE_EXPERIENCE_ID);
    expect(ver.ok && ver.value).toBe(1);
  });

  it("expected_version mismatch returns current_version", async () => {
    const store = new InMemoryEventStore();
    await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "open",
      expected_version: -1,
      events: [sessionDraft()],
    });
    const idea = createDomainEventDraft({
      message_name: "reader_world.reader_idea.proposed.v1",
      experience_id: FIXTURE_EXPERIENCE_ID,
      correlation_id: "c",
      producer,
      security,
      payload: {
        idea_id: "i1",
        idea_kind: "h",
        text: "t",
        source_ids: [],
        evidence_refs: [],
        revision: 1,
        supersedes: null,
      },
    });
    const conflict = await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "idea-wrong-ver",
      expected_version: -1,
      events: [idea],
    });
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.error.code).toBe("EXPECTED_VERSION_MISMATCH");
    expect(conflict.error.current_version).toBe(1);
  });

  it("multi-event commit assigns monotonic stream_version and index", async () => {
    const store = new InMemoryEventStore();
    const { drafts, reset } = withFixedScenarioDrafts();
    try {
      let expected = -1;
      for (let i = 0; i < drafts.length; i++) {
        const res = await store.append({
          experience_id: FIXTURE_EXPERIENCE_ID,
          principal_id: FIXTURE_PRINCIPAL_ID,
          idempotency_key: `step-${i}`,
          expected_version: expected,
          events: [drafts[i]],
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expected = res.value.committed_version;
      }
      const loaded = await store.load(FIXTURE_EXPERIENCE_ID);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      expect(loaded.value).toHaveLength(drafts.length);
      loaded.value.forEach((e, idx) => {
        expect(e.stream_version).toBe(idx + 1);
        expect(e.event_index_in_commit).toBe(0);
      });
      const ver = await store.getVersion(FIXTURE_EXPERIENCE_ID);
      expect(ver.ok && ver.value).toBe(drafts.length);
    } finally {
      reset();
    }
  });

  it("batch append assigns event_index_in_commit within one commit", async () => {
    const store = new InMemoryEventStore();
    const open = sessionDraft();
    await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "open",
      expected_version: -1,
      events: [open],
    });
    const a = createDomainEventDraft({
      message_name: "reader_world.reader_idea.proposed.v1",
      experience_id: FIXTURE_EXPERIENCE_ID,
      correlation_id: "c",
      producer,
      security,
      payload: {
        idea_id: "a",
        idea_kind: "h",
        text: "a",
        source_ids: [],
        evidence_refs: [],
        revision: 1,
        supersedes: null,
      },
    });
    const b = createDomainEventDraft({
      message_name: "reader_world.reader_idea.proposed.v1",
      experience_id: FIXTURE_EXPERIENCE_ID,
      correlation_id: "c",
      producer,
      security,
      payload: {
        idea_id: "b",
        idea_kind: "h",
        text: "b",
        source_ids: [],
        evidence_refs: [],
        revision: 1,
        supersedes: null,
      },
    });
    const res = await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "batch",
      expected_version: 1,
      events: [a, b],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.committed_version).toBe(3);
    const loaded = await store.load(FIXTURE_EXPERIENCE_ID);
    if (!loaded.ok) return;
    expect(loaded.value[1].event_index_in_commit).toBe(0);
    expect(loaded.value[2].event_index_in_commit).toBe(1);
    expect(loaded.value[1].stream_version).toBe(2);
    expect(loaded.value[2].stream_version).toBe(3);
  });
});
