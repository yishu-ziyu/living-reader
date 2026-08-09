import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "@/infrastructure/event-store/memory";
import {
  createDomainEventDraft,
  installTestSources,
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
} from "@/modules/reader-world/events";

const producer = { module: "reader_world" as const, instance: "mixed-replay" };
const security = {
  principal_id: "reader_mixed",
  authority: "reader" as const,
  integrity: "local" as const,
};

function draft(message_id: string, recorded_at: string) {
  return createDomainEventDraft({
    message_name: "reader_world.reading_session.opened.v1",
    message_id,
    recorded_at,
    experience_id: "exp_mixed_replay",
    correlation_id: "corr_mixed_replay",
    producer,
    security,
    payload: {
      book_id: "wealth-of-nations",
      book_revision: "r1",
      initial_source_id: "smith.b1.c1.p1",
      scenario_id: "reading",
      locale: "zh-CN",
    },
  });
}

describe("InMemoryEventStore envelope v2 replay", () => {
  it("loads a mixed v1/v2 stream as canonical v2 without replacing legacy IDs", async () => {
    installTestSources({ fixedTime: "2026-08-09T00:00:00.000Z" });
    const legacyDraft = draft("msg_pre_ulid", "2026-01-02T03:04:05.006Z");
    const { hlc: _hlc, device_id: _device, ...legacyBase } = legacyDraft;
    void _hlc;
    void _device;
    const legacy = {
      ...legacyBase,
      protocol_version: LEGACY_PROTOCOL_VERSION,
      stream_version: 1,
      event_index_in_commit: 0,
    };
    const current = {
      ...draft("01KZZZZZZZZZZZZZZZZZZZZZZZ", "2026-08-09T00:00:01.000Z"),
      stream_version: 2,
      event_index_in_commit: 0,
    };

    const store = new InMemoryEventStore({ initial_events: [legacy, current] });
    const loaded = await store.load("exp_mixed_replay");

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.map((event) => event.protocol_version)).toEqual([
      PROTOCOL_VERSION,
      PROTOCOL_VERSION,
    ]);
    expect(loaded.value.map((event) => event.message_id)).toEqual([
      "msg_pre_ulid",
      "01KZZZZZZZZZZZZZZZZZZZZZZZ",
    ]);
    expect(loaded.value[0]!.device_id).toBe("legacy-local");
    expect(loaded.value[0]!.hlc).toEqual({
      physical_ms: 1_767_323_045_006,
      logical: 1_000,
    });
    expect(loaded.value[1]!.device_id).toBe("local-device");
    expect(await store.getVersion("exp_mixed_replay")).toEqual({
      ok: true,
      value: 2,
    });
  });

  it("fails closed when a persisted legacy row contains an unknown field", async () => {
    const legacyDraft = draft("msg_dirty_legacy", "2026-01-02T03:04:05.006Z");
    const { hlc: _hlc, device_id: _device, ...legacyBase } = legacyDraft;
    void _hlc;
    void _device;
    const store = new InMemoryEventStore({
      initial_events: [
        {
          ...legacyBase,
          protocol_version: LEGACY_PROTOCOL_VERSION,
          stream_version: 1,
          event_index_in_commit: 0,
          event_id: "forbidden",
        },
      ],
    });

    const loaded = await store.load("exp_mixed_replay");
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.error.code).toBe("INVALID_ENVELOPE");
  });
});
