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
} from "../../fixtures/event-store/scenario-sequence";

function freshSecurity() {
  return {
    principal_id: FIXTURE_PRINCIPAL_ID,
    authority: "reader" as const,
    integrity: "local" as const,
  };
}

function freshProducer() {
  return { module: "reader_world" as const, instance: "unit" };
}

function sessionDraft(overrides?: {
  message_id?: string;
  book_id?: string;
}) {
  return createDomainEventDraft({
    message_name: "reader_world.reading_session.opened.v1",
    experience_id: FIXTURE_EXPERIENCE_ID,
    correlation_id: "corr_f23",
    producer: freshProducer(),
    security: freshSecurity(),
    message_id: overrides?.message_id,
    payload: {
      book_id: overrides?.book_id ?? "book_f23",
      book_revision: "r1",
      initial_source_id: "s1",
      scenario_id: "sc",
      locale: "en",
    },
  });
}

function ideaDraft(overrides?: {
  message_id?: string;
  idea_id?: string;
}) {
  return createDomainEventDraft({
    message_name: "reader_world.reader_idea.proposed.v1",
    experience_id: FIXTURE_EXPERIENCE_ID,
    correlation_id: "corr_f23",
    producer: freshProducer(),
    security: freshSecurity(),
    message_id: overrides?.message_id,
    payload: {
      idea_id: overrides?.idea_id ?? "idea_f23",
      idea_kind: "h",
      text: "t",
      source_ids: [],
      evidence_refs: [],
      revision: 1,
      supersedes: null,
    },
  });
}

describe("F23 · InMemoryEventStore immutability + duplicate message_id", () => {
  afterEach(() => {
    installTestSources().reset();
  });

  it("mutating draft.payload after append does not rewrite stored history", async () => {
    const store = new InMemoryEventStore();
    const draft = sessionDraft({ book_id: "original_book" });

    const res = await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "f23-mut-draft",
      expected_version: -1,
      events: [draft],
    });
    expect(res.ok).toBe(true);

    // External mutation of the caller's draft must not reach the store.
    (draft.payload as { book_id: string }).book_id = "mutated_after_append";
    draft.producer.instance = "mutated_producer";
    draft.security.authority = "system";

    const loaded = await store.load(FIXTURE_EXPERIENCE_ID);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value).toHaveLength(1);
    expect(
      (loaded.value[0].payload as { book_id: string }).book_id,
    ).toBe("original_book");
    expect(loaded.value[0].producer.instance).toBe("unit");
    expect(loaded.value[0].security.authority).toBe("reader");
  });

  it("mutating loaded event.payload does not rewrite stored history", async () => {
    const store = new InMemoryEventStore();
    const draft = sessionDraft({ book_id: "stable_book" });

    await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "f23-mut-load",
      expected_version: -1,
      events: [draft],
    });

    const first = await store.load(FIXTURE_EXPERIENCE_ID);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    (first.value[0].payload as { book_id: string }).book_id = "mutated_via_load";
    first.value[0].producer.instance = "mutated";

    const second = await store.load(FIXTURE_EXPERIENCE_ID);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(
      (second.value[0].payload as { book_id: string }).book_id,
    ).toBe("stable_book");
    expect(second.value[0].producer.instance).toBe("unit");
  });

  it("second commit reusing message_id fails; version and count unchanged", async () => {
    const store = new InMemoryEventStore();
    const fixedId = "01K25V2J000000000000000030";
    const first = sessionDraft({ message_id: fixedId, book_id: "book_a" });

    const ok = await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "f23-first",
      expected_version: -1,
      events: [first],
    });
    expect(ok.ok).toBe(true);

    // Different event body, same message_id, different idempotency key.
    const second = ideaDraft({ message_id: fixedId, idea_id: "other" });
    second.payload_hash = payloadHash(second.payload);

    const bad = await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "f23-second-reuse-mid",
      expected_version: 1,
      events: [second],
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe("DUPLICATE_MESSAGE_ID");

    const ver = await store.getVersion(FIXTURE_EXPERIENCE_ID);
    expect(ver.ok && ver.value).toBe(1);
    const loaded = await store.load(FIXTURE_EXPERIENCE_ID);
    expect(loaded.ok && loaded.value.length).toBe(1);
  });

  it("same-batch duplicate message_id fails; version and count unchanged", async () => {
    const store = new InMemoryEventStore();
    const open = sessionDraft();
    await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "f23-open",
      expected_version: -1,
      events: [open],
    });

    const sharedId = "01K25V2J000000000000000031";
    const a = ideaDraft({ message_id: sharedId, idea_id: "a" });
    const b = ideaDraft({ message_id: sharedId, idea_id: "b" });
    a.payload_hash = payloadHash(a.payload);
    b.payload_hash = payloadHash(b.payload);

    const bad = await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "f23-batch-dup",
      expected_version: 1,
      events: [a, b],
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe("DUPLICATE_MESSAGE_ID");

    const ver = await store.getVersion(FIXTURE_EXPERIENCE_ID);
    expect(ver.ok && ver.value).toBe(1);
    const loaded = await store.load(FIXTURE_EXPERIENCE_ID);
    expect(loaded.ok && loaded.value.length).toBe(1);
  });

  it("getIdempotencyReceipt returns copies of message_ids / payload_hashes", async () => {
    const store = new InMemoryEventStore();
    const draft = sessionDraft();
    await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "f23-receipt",
      expected_version: -1,
      events: [draft],
    });

    const r1 = await store.getIdempotencyReceipt(
      FIXTURE_PRINCIPAL_ID,
      FIXTURE_EXPERIENCE_ID,
      "f23-receipt",
    );
    expect(r1.ok && r1.value).toBeTruthy();
    if (!r1.ok || !r1.value) return;

    const originalIds = [...r1.value.message_ids];
    const originalHashes = [...r1.value.payload_hashes];
    r1.value.message_ids.push("mutated");
    r1.value.payload_hashes[0] = "mutated_hash";

    const r2 = await store.getIdempotencyReceipt(
      FIXTURE_PRINCIPAL_ID,
      FIXTURE_EXPERIENCE_ID,
      "f23-receipt",
    );
    expect(r2.ok && r2.value).toBeTruthy();
    if (!r2.ok || !r2.value) return;
    expect(r2.value.message_ids).toEqual(originalIds);
    expect(r2.value.payload_hashes).toEqual(originalHashes);
  });
});
