/**
 * F25 rework: frozen world metrics storage + public allowlist.
 * Secret aliases and case variants must not append or enter debug.
 * Covers primitive, nested object, nested array layers (Node).
 */
import { describe, expect, it, afterEach } from "vitest";
import { InMemoryEventStore } from "@/infrastructure/event-store/memory";
import {
  createDomainEventDraft,
  debugTraceContainsSecrets,
  exportDebugTrace,
  installTestSources,
  payloadHash,
  validateDomainEventDraft,
  WORLD_METRICS_ALLOWLIST,
  type DomainEvent,
} from "@/modules/reader-world/events";
import {
  FIXTURE_EXPERIENCE_ID,
  FIXTURE_PRINCIPAL_ID,
} from "../../fixtures/event-store/scenario-sequence";

const security = {
  principal_id: FIXTURE_PRINCIPAL_ID,
  authority: "reader" as const,
  integrity: "local" as const,
};
const producer = { module: "reader_world" as const, instance: "unit" };

function worldEventPayload(metrics: Record<string, unknown>) {
  return {
    world_id: "w1",
    world_revision: 1,
    event_kind: "market_opened",
    summary: "ok",
    actor_id: null as string | null,
    metrics,
  };
}

function worldDraft(metrics: Record<string, unknown>) {
  const payload = worldEventPayload(metrics);
  // createDomainEventDraft types metrics as Record of primitives — cast via dirty path
  const base = createDomainEventDraft({
    message_name: "reader_world.world.event_recorded.v1",
    experience_id: FIXTURE_EXPERIENCE_ID,
    correlation_id: "corr_f25_m",
    producer,
    security,
    payload: {
      world_id: "w1",
      world_revision: 1,
      event_kind: "market_opened",
      summary: "ok",
      actor_id: null,
      metrics: { demand: 1, supply: 2 },
    },
  });
  return {
    ...base,
    payload,
    payload_hash: payloadHash(payload),
  };
}

describe("F25 world metrics frozen allowlist", () => {
  afterEach(() => {
    installTestSources().reset();
  });

  it("exports frozen WORLD_METRICS_ALLOWLIST including demand/supply", () => {
    expect(WORLD_METRICS_ALLOWLIST).toEqual(
      expect.arrayContaining(["demand", "supply", "score", "label"]),
    );
  });

  it("rejects primitive metrics aliases (user_prompt / provider_credential / rawAudio)", () => {
    for (const key of ["user_prompt", "provider_credential", "rawAudio"]) {
      const draft = worldDraft({
        demand: 1,
        [key]:
          key === "user_prompt"
            ? "SECRET_PROMPT"
            : key === "provider_credential"
              ? "SECRET_CREDENTIAL"
              : "SECRET_AUDIO",
      });
      const res = validateDomainEventDraft(draft);
      expect(res.ok, key).toBe(false);
      if (!res.ok) expect(res.error.code).toBe("INVALID_PAYLOAD");
    }
  });

  it("rejects case variants of secret metric keys", () => {
    for (const key of ["User_Prompt", "PROVIDER_CREDENTIAL", "RawAudio", "RAW_AUDIO"]) {
      const draft = worldDraft({ demand: 1, [key]: "SECRET_PROMPT" });
      const res = validateDomainEventDraft(draft);
      expect(res.ok, key).toBe(false);
      if (!res.ok) expect(res.error.code).toBe("INVALID_PAYLOAD");
    }
  });

  it("rejects nested object under metrics", () => {
    const draft = worldDraft({
      demand: 1,
      leak: { user_prompt: "SECRET_PROMPT" },
    } as Record<string, unknown>);
    // unknown key "leak" OR nested — either INVALID_PAYLOAD
    const res = validateDomainEventDraft(draft);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_PAYLOAD");
  });

  it("rejects nested array under metrics value", () => {
    const draft = worldDraft({
      demand: 1,
      score: ["SECRET_PROMPT"] as unknown as number,
    });
    // score must be number|string|boolean — array fails
    const res = validateDomainEventDraft({
      ...draft,
      payload: worldEventPayload({
        demand: 1,
        score: ["SECRET_PROMPT"] as unknown as number,
      }),
      payload_hash: payloadHash(
        worldEventPayload({
          demand: 1,
          score: ["SECRET_PROMPT"] as unknown as number,
        }),
      ),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_PAYLOAD");
  });

  it("accepts allowlisted primitive metrics only", () => {
    const draft = worldDraft({ demand: 10, supply: 3, score: 1, label: "ok" });
    const res = validateDomainEventDraft(draft);
    expect(res.ok).toBe(true);
  });

  it("Memory append rejects secret metric aliases (zero events)", async () => {
    const store = new InMemoryEventStore();
    // open session first so world event is not only test
    const open = createDomainEventDraft({
      message_name: "reader_world.reading_session.opened.v1",
      experience_id: FIXTURE_EXPERIENCE_ID,
      correlation_id: "c",
      producer,
      security,
      payload: {
        book_id: "b",
        book_revision: "r",
        initial_source_id: "s",
        scenario_id: "sc",
        locale: "en",
      },
    });
    await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "open",
      expected_version: -1,
      events: [open],
    });

    const dirty = worldDraft({
      demand: 1,
      user_prompt: "SECRET_PROMPT",
      provider_credential: "SECRET_CREDENTIAL",
      rawAudio: "SECRET_AUDIO",
    });
    const res = await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "world-secret",
      expected_version: 1,
      events: [dirty as never],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_PAYLOAD");

    const loaded = await store.load(FIXTURE_EXPERIENCE_ID);
    expect(loaded.ok && loaded.value.length).toBe(1);
  });

  it("exportDebugTrace never emits secret metric aliases even if forced on dirty event", () => {
    const draft = worldDraft({ demand: 1, supply: 2 });
    const dirty = {
      ...draft,
      payload: {
        ...draft.payload,
        metrics: {
          demand: 1,
          supply: 2,
          user_prompt: "SECRET_PROMPT",
          provider_credential: "SECRET_CREDENTIAL",
          rawAudio: "SECRET_AUDIO",
        },
      },
      stream_version: 1,
      event_index_in_commit: 0,
    } as unknown as DomainEvent;

    const json = JSON.stringify(exportDebugTrace([dirty]));
    expect(debugTraceContainsSecrets(json)).toBe(false);
    expect(json).not.toContain("user_prompt");
    expect(json).not.toContain("provider_credential");
    expect(json).not.toContain("rawAudio");
    expect(json).not.toContain("SECRET_PROMPT");
    expect(json).not.toContain("SECRET_CREDENTIAL");
    expect(json).not.toContain("SECRET_AUDIO");
  });
});
