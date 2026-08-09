import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDomainEventDraft,
  compareEventEnvelopeOrder,
  defaultDeviceId,
  defaultMetadata,
  installTestSources,
  LEGACY_PROTOCOL_VERSION,
  resetHybridLogicalClock,
  PROTOCOL_VERSION,
  validateDomainEventDraft,
  validateStoredDomainEvent,
} from "@/modules/reader-world/events";

const producer = { module: "reader_world" as const, instance: "envelope-v2" };
const security = {
  principal_id: "reader_1",
  authority: "reader" as const,
  integrity: "local" as const,
};

function sessionDraft() {
  return createDomainEventDraft({
    message_name: "reader_world.reading_session.opened.v1",
    experience_id: "exp_envelope_v2",
    correlation_id: "corr_envelope_v2",
    producer,
    security,
    payload: {
      book_id: "wealth-of-nations",
      book_revision: "cannan-r1",
      initial_source_id: "smith.b1.c1.p1",
      scenario_id: "reading",
      locale: "zh-CN",
    },
  });
}

describe("event envelope v2", () => {
  afterEach(() => {
    installTestSources().reset();
    vi.unstubAllGlobals();
  });

  it("creates a v2 draft with canonical ULID message_id and only hlc/device metadata", () => {
    const draft = sessionDraft();

    expect(PROTOCOL_VERSION).toBe("reader-world-protocol/v2");
    expect(draft.protocol_version).toBe(PROTOCOL_VERSION);
    expect(draft.message_id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    expect(draft.hlc.physical_ms).toBeTypeOf("number");
    expect(draft.hlc.logical).toBe(0);
    expect(draft.device_id).toMatch(
      /^device_[0-7][0-9A-HJKMNP-TV-Z]{25}$/,
    );
    expect(draft).not.toHaveProperty("event_id");
    expect(draft).not.toHaveProperty("eventId");
    expect(validateDomainEventDraft(draft).ok).toBe(true);
  });

  it("rejects non-canonical message IDs at both v2 persistence boundaries", () => {
    const draft = sessionDraft();
    const invalidMessageIds = [
      "msg_reload_local_1",
      "01hzx3k6r9m8n7p5q4s2t1v0wy",
      "81HZX3K6R9M8N7P5Q4S2T1V0WY",
    ];

    for (const message_id of invalidMessageIds) {
      const written = validateDomainEventDraft({ ...draft, message_id });
      expect(written.ok, message_id).toBe(false);
      if (!written.ok) expect(written.error.code).toBe("INVALID_ENVELOPE");

      const loaded = validateStoredDomainEvent({
        ...draft,
        message_id,
        stream_version: 1,
        event_index_in_commit: 0,
      });
      expect(loaded.ok, message_id).toBe(false);
      if (!loaded.ok) expect(loaded.error.code).toBe("INVALID_ENVELOPE");
    }
  });

  it("persists one browser device ID across calls", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    });

    const first = defaultDeviceId();
    const second = defaultDeviceId();

    expect(second).toBe(first);
    expect(values.get("living-reader.device-id.v1")).toBe(first);
  });

  it("keeps HLC monotonic when the injected clock does not advance", () => {
    installTestSources({
      idPrefix: "fixture_",
      fixedTime: "2026-08-09T12:34:56.789Z",
      deviceId: "device-test",
    });

    const first = sessionDraft();
    const second = sessionDraft();

    expect(first.hlc).toEqual({ physical_ms: 1_786_278_896_789, logical: 0 });
    expect(second.hlc).toEqual({ physical_ms: 1_786_278_896_789, logical: 1 });
    expect(first.device_id).toBe("device-test");
    expect(second.device_id).toBe("device-test");
  });

  it("restores the device HLC watermark after reload and clock rollback", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    });
    const deviceId = "device-reload";
    const firstPhysicalMs = Date.parse("2026-08-09T12:34:56.789Z");

    resetHybridLogicalClock();
    const first = defaultMetadata(
      "2026-08-09T12:34:56.789Z",
      deviceId,
    );
    resetHybridLogicalClock();
    const afterReload = defaultMetadata(
      "2026-08-08T12:34:56.789Z",
      deviceId,
    );

    expect(first.hlc).toEqual({ physical_ms: firstPhysicalMs, logical: 0 });
    expect(afterReload.hlc).toEqual({
      physical_ms: firstPhysicalMs,
      logical: 1,
    });
    expect(
      JSON.parse(
        values.get(`living-reader.hlc-watermark.v1:${deviceId}`) ?? "null",
      ),
    ).toEqual(afterReload.hlc);
  });

  it("orders sync candidates by HLC, device_id, then canonical message_id", () => {
    const base = sessionDraft();
    const candidates = [
      { ...base, message_id: "B", device_id: "device-b", hlc: { physical_ms: 2, logical: 0 } },
      { ...base, message_id: "C", device_id: "device-a", hlc: { physical_ms: 2, logical: 0 } },
      { ...base, message_id: "A", device_id: "device-a", hlc: { physical_ms: 2, logical: 0 } },
      { ...base, message_id: "D", device_id: "device-z", hlc: { physical_ms: 1, logical: 9 } },
      { ...base, message_id: "E", device_id: "device-a", hlc: { physical_ms: 2, logical: 1 } },
    ];

    expect(candidates.sort(compareEventEnvelopeOrder).map((event) => event.message_id)).toEqual([
      "D",
      "A",
      "C",
      "B",
      "E",
    ]);
  });

  it("purely upcasts a stored v1 event while preserving canonical message_id", () => {
    installTestSources({
      idPrefix: "legacy_generated_",
      fixedTime: "2026-08-09T12:34:56.789Z",
    });
    const current = sessionDraft();
    const { hlc: _hlc, device_id: _device, ...withoutV2Metadata } = current;
    void _hlc;
    void _device;
    const legacy = {
      ...withoutV2Metadata,
      protocol_version: LEGACY_PROTOCOL_VERSION,
      message_id: "msg_legacy_keep_me",
      stream_version: 7,
      event_index_in_commit: 3,
    };

    const first = validateStoredDomainEvent(legacy);
    const second = validateStoredDomainEvent(legacy);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).toEqual(second.value);
    expect(first.value.protocol_version).toBe(PROTOCOL_VERSION);
    expect(first.value.message_id).toBe("msg_legacy_keep_me");
    expect(first.value.device_id).toBe("legacy-local");
    expect(first.value.hlc).toEqual({
      physical_ms: 1_786_278_896_789,
      logical: 7_003,
    });
  });

  it("fails closed for unknown v1 or v2 envelope fields", () => {
    const draft = sessionDraft();
    const v2 = validateDomainEventDraft({ ...draft, eventId: "second-id" });
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.error.code).toBe("INVALID_ENVELOPE");

    const { hlc: _hlc, device_id: _device, ...withoutV2Metadata } = draft;
    void _hlc;
    void _device;
    const legacy = validateStoredDomainEvent({
      ...withoutV2Metadata,
      protocol_version: LEGACY_PROTOCOL_VERSION,
      stream_version: 1,
      event_index_in_commit: 0,
      event_id: "forbidden-second-id",
    });
    expect(legacy.ok).toBe(false);
    if (!legacy.ok) expect(legacy.error.code).toBe("INVALID_ENVELOPE");
  });

  it("accepts recipe-bound seeded.v2 and keeps wool-town seeded.v1 independent", () => {
    const v2 = createDomainEventDraft({
      message_name: "reader_world.world.seeded.v2",
      experience_id: "exp_seed_v2",
      correlation_id: "corr_seed_v2",
      producer,
      security,
      payload: {
        world_id: "world_recipe_1",
        graph_revision: 4,
        seed: 17,
        ruleset_id: "wool-town-v1",
        recipe_id: "division-deepening-v1",
        recipe_fingerprint: "sha256:recipe-fixture",
        normalized_parameters: { workers: 8, transport: false },
      },
    });
    expect(v2.schema_version).toBe(2);
    expect(validateDomainEventDraft(v2).ok).toBe(true);

    const v1 = createDomainEventDraft({
      message_name: "reader_world.world.seeded.v1",
      experience_id: "exp_seed_v1",
      correlation_id: "corr_seed_v1",
      producer,
      security,
      payload: {
        world_id: "world_wool_town",
        graph_revision: 1,
        seed: 42,
        ruleset_id: "wool-town-v1",
      },
    });
    expect(v1.schema_version).toBe(1);
    expect(v1.payload).not.toHaveProperty("recipe_id");
    expect(validateDomainEventDraft(v1).ok).toBe(true);

    const dirty = validateDomainEventDraft({
      ...v2,
      payload: { ...v2.payload, compiler_debug: true },
    });
    expect(dirty.ok).toBe(false);
    if (!dirty.ok) expect(dirty.error.code).toBe("INVALID_PAYLOAD");
  });
});
