import { describe, expect, it, afterEach } from "vitest";
import {
  createDomainEventDraft,
  debugTraceContainsSecrets,
  exportDebugTrace,
  installTestSources,
  type DomainEvent,
} from "@/modules/reader-world/events";

const baseSecurity = {
  principal_id: "p1",
  authority: "reader" as const,
  integrity: "local" as const,
};

const baseProducer = { module: "reader_world" as const, instance: "t" };

describe("F25 debug trace public payload allowlist", () => {
  afterEach(() => {
    installTestSources().reset();
  });

  it("drops nested secret aliases and secret values from JSON", () => {
    const { reset } = installTestSources({
      fixedTime: "2026-08-08T12:00:00.000Z",
    });

    // Build a valid typed draft, then inject forbidden keys at runtime
    // (store path should reject these; debug path must still strip).
    const draft = createDomainEventDraft({
      message_name: "reader_world.reader_idea.proposed.v1",
      experience_id: "exp1",
      correlation_id: "corr_f25",
      causation_id: "cause_f25",
      producer: baseProducer,
      security: {
        ...baseSecurity,
        authentication_context: "SECRET_AUTH_CTX",
      },
      payload: {
        idea_id: "idea_1",
        idea_kind: "question",
        text: "public idea text",
        source_ids: ["src_1"],
        evidence_refs: ["ev_1"],
        revision: 1,
        supersedes: null,
      },
    });

    const dirtyPayload = {
      ...draft.payload,
      user_prompt: "SECRET_PROMPT",
      provider_credential: "SECRET_CREDENTIAL",
      rawAudio: "SECRET_AUDIO",
      nested: {
        user_prompt: "SECRET_PROMPT",
        provider_credential: "SECRET_CREDENTIAL",
      },
    };

    const event = {
      ...draft,
      payload: dirtyPayload,
      payload_hash: draft.payload_hash!,
      stream_version: 3,
      event_index_in_commit: 0,
    } as unknown as DomainEvent;

    const trace = exportDebugTrace([event]);
    const json = JSON.stringify(trace);

    expect(debugTraceContainsSecrets(json)).toBe(false);
    expect(json).not.toContain("user_prompt");
    expect(json).not.toContain("provider_credential");
    expect(json).not.toContain("rawAudio");
    expect(json).not.toContain("SECRET_PROMPT");
    expect(json).not.toContain("SECRET_CREDENTIAL");
    expect(json).not.toContain("SECRET_AUDIO");
    expect(json).not.toContain("SECRET_AUTH_CTX");
    expect(json).not.toContain("authentication_context");
    expect(json).not.toContain("nested");

    // Allowlisted public fields still present
    expect(trace[0].payload.idea_id).toBe("idea_1");
    expect(trace[0].payload.text).toBe("public idea text");
    expect(trace[0].payload.idea_kind).toBe("question");
    expect(trace[0].payload.source_ids).toEqual(["src_1"]);

    // Envelope public fields present
    expect(trace[0].message_id).toBe(draft.message_id);
    expect(trace[0].correlation_id).toBe("corr_f25");
    expect(trace[0].causation_id).toBe("cause_f25");
    expect(trace[0].stream_version).toBe(3);
    expect(trace[0].payload_hash).toBe(draft.payload_hash);
    expect(trace[0].payload_hash).toMatch(/^[a-f0-9]{64}$/);

    reset();
  });

  it("keeps session allowlisted fields and strips extras", () => {
    const draft = createDomainEventDraft({
      message_name: "reader_world.reading_session.opened.v1",
      experience_id: "exp1",
      correlation_id: "c1",
      producer: baseProducer,
      security: baseSecurity,
      payload: {
        book_id: "book_42",
        book_revision: "rev_1",
        initial_source_id: "src_0",
        scenario_id: "sc_1",
        locale: "zh-CN",
        seed: 7,
      },
    });

    const dirty = {
      ...draft,
      payload: {
        ...draft.payload,
        user_prompt: "SECRET_PROMPT",
        credential: "SECRET_CREDENTIAL",
      },
      stream_version: 1,
      event_index_in_commit: 0,
    } as unknown as DomainEvent;

    const trace = exportDebugTrace([dirty]);
    const json = JSON.stringify(trace);

    expect(json).not.toContain("SECRET_PROMPT");
    expect(json).not.toContain("user_prompt");
    expect(trace[0].payload.book_id).toBe("book_42");
    expect(trace[0].payload.seed).toBe(7);
    expect(trace[0].payload).not.toHaveProperty("user_prompt");
    expect(trace[0].message_id).toBeTruthy();
    expect(trace[0].payload_hash).toBeTruthy();
  });

  it("strips non-primitive values nested under metrics", () => {
    const draft = createDomainEventDraft({
      message_name: "reader_world.world.event_recorded.v1",
      experience_id: "exp1",
      correlation_id: "c1",
      producer: baseProducer,
      security: baseSecurity,
      payload: {
        world_id: "w1",
        world_revision: 2,
        event_kind: "tick",
        summary: "ok",
        metrics: { score: 1, label: "a" },
      },
    });

    const dirty = {
      ...draft,
      payload: {
        ...draft.payload,
        metrics: {
          score: 1,
          label: "a",
          leak: { user_prompt: "SECRET_PROMPT" },
        },
      },
      stream_version: 1,
      event_index_in_commit: 0,
    } as unknown as DomainEvent;

    const trace = exportDebugTrace([dirty]);
    const json = JSON.stringify(trace);
    expect(json).not.toContain("SECRET_PROMPT");
    expect(json).not.toContain("user_prompt");
    expect(trace[0].payload.metrics).toEqual({ score: 1, label: "a" });
  });
});
