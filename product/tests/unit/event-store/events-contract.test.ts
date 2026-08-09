import { describe, expect, it, afterEach } from "vitest";
import {
  canonicalize,
  createDomainEventDraft,
  DOMAIN_EVENT_NAMES,
  exportDebugTrace,
  debugTraceContainsSecrets,
  installTestSources,
  isDomainEventName,
  payloadHash,
  validateDomainEventDraft,
} from "@/modules/reader-world/events";

const baseSecurity = {
  principal_id: "p1",
  authority: "reader" as const,
  integrity: "local" as const,
};

const baseProducer = { module: "reader_world" as const, instance: "t" };

describe("T003 events contract", () => {
  afterEach(() => {
    installTestSources().reset();
  });

  it("registers exactly the frozen event names", () => {
    expect(DOMAIN_EVENT_NAMES).toEqual([
      "reader_world.reading_session.opened.v1",
      "reader_world.reader_idea.proposed.v1",
      "agent_os.book_thought.proposed.v1",
      "reader_world.relation.proposed.v1",
      "reader_world.relation.reviewed.v1",
      "reader_world.graph.committed.v1",
      "reader_world.world.seeded.v1",
      "reader_world.world.seeded.v2",
      "reader_world.world.event_recorded.v1",
      "reader_world.memory.noted.v1",
      "reader_world.memory.retired.v1",
    ]);
    expect(isDomainEventName("reader_world.reading_session.opened.v1")).toBe(
      true,
    );
    expect(isDomainEventName("reader_world.unknown.v1")).toBe(false);
  });

  it("canonicalizes with sorted keys and stable hash", () => {
    const a = { b: 1, a: { z: 2, y: 3 } };
    const b = { a: { y: 3, z: 2 }, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(payloadHash(a)).toBe(payloadHash(b));
    expect(payloadHash(a)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects unknown message_name and wrong schema_version", () => {
    const draft = createDomainEventDraft({
      message_name: "reader_world.reading_session.opened.v1",
      experience_id: "exp1",
      correlation_id: "c1",
      producer: baseProducer,
      security: baseSecurity,
      payload: {
        book_id: "b",
        book_revision: "r",
        initial_source_id: "s",
        scenario_id: "sc",
        locale: "en",
      },
    });

    const unknown = validateDomainEventDraft({
      ...draft,
      message_name: "reader_world.not_frozen.v1",
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("UNKNOWN_MESSAGE_NAME");

    const badSchema = validateDomainEventDraft({
      ...draft,
      schema_version: 99,
    });
    expect(badSchema.ok).toBe(false);
    if (!badSchema.ok)
      expect(badSchema.error.code).toBe("UNSUPPORTED_SCHEMA_VERSION");
  });

  it("rejects payload_hash mismatch", () => {
    const draft = createDomainEventDraft({
      message_name: "reader_world.reading_session.opened.v1",
      experience_id: "exp1",
      correlation_id: "c1",
      producer: baseProducer,
      security: baseSecurity,
      payload: {
        book_id: "b",
        book_revision: "r",
        initial_source_id: "s",
        scenario_id: "sc",
        locale: "en",
      },
    });
    const bad = validateDomainEventDraft({
      ...draft,
      payload_hash: "0".repeat(64),
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("PAYLOAD_HASH_MISMATCH");
  });

  it("exportDebugTrace redacts authentication_context and secret keys", () => {
    const { reset } = installTestSources({ fixedTime: "2026-08-08T12:00:00.000Z" });
    const draft = createDomainEventDraft({
      message_name: "reader_world.reading_session.opened.v1",
      experience_id: "exp1",
      correlation_id: "c1",
      producer: baseProducer,
      security: {
        ...baseSecurity,
        authentication_context: "SECRET_AUTH_CTX",
      },
      payload: {
        book_id: "b",
        book_revision: "r",
        initial_source_id: "s",
        scenario_id: "sc",
        locale: "en",
      },
    });
    const event = {
      ...draft,
      payload_hash: draft.payload_hash!,
      stream_version: 1,
      event_index_in_commit: 0,
    };
    const trace = exportDebugTrace([event]);
    const json = JSON.stringify(trace);
    expect(debugTraceContainsSecrets(json)).toBe(false);
    expect(json).not.toContain("SECRET_AUTH_CTX");
    expect(json).not.toContain("authentication_context");
    expect(trace[0].message_id).toBeTruthy();
    expect(trace[0].payload_hash).toBeTruthy();
    expect(trace[0].correlation_id).toBe("c1");
    reset();
  });
});
