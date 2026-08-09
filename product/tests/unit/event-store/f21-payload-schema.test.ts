import { describe, expect, it, afterEach } from "vitest";
import {
  createDomainEventDraft,
  installTestSources,
  payloadHash,
  validateDomainEventDraft,
} from "@/modules/reader-world/events";

const baseSecurity = {
  principal_id: "p1",
  authority: "reader" as const,
  integrity: "local" as const,
};

const baseProducer = { module: "reader_world" as const, instance: "t" };

const sessionPayload = {
  book_id: "b",
  book_revision: "r",
  initial_source_id: "s",
  scenario_id: "sc",
  locale: "en",
};

function validSessionDraft() {
  return createDomainEventDraft({
    message_name: "reader_world.reading_session.opened.v1",
    experience_id: "exp1",
    correlation_id: "c1",
    producer: baseProducer,
    security: baseSecurity,
    payload: sessionPayload,
  });
}

describe("F21 DomainEvent envelope/payload fail-closed", () => {
  afterEach(() => {
    installTestSources().reset();
  });

  it("rejects missing payload_hash with INVALID_ENVELOPE", () => {
    const draft = validSessionDraft();
    const { payload_hash: _drop, ...withoutHash } = draft as typeof draft & {
      payload_hash?: string;
    };
    void _drop;
    const res = validateDomainEventDraft(withoutHash);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_ENVELOPE");
  });

  it("rejects empty payload_hash with INVALID_ENVELOPE", () => {
    const draft = validSessionDraft();
    const res = validateDomainEventDraft({ ...draft, payload_hash: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_ENVELOPE");
  });

  it("rejects wrong payload_hash with PAYLOAD_HASH_MISMATCH", () => {
    const draft = validSessionDraft();
    const res = validateDomainEventDraft({
      ...draft,
      payload_hash: "0".repeat(64),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PAYLOAD_HASH_MISMATCH");
  });

  it("rejects missing producer.module", () => {
    const draft = validSessionDraft();
    const res = validateDomainEventDraft({
      ...draft,
      producer: { module: "", instance: "t" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_ENVELOPE");
  });

  it("rejects missing producer.instance", () => {
    const draft = validSessionDraft();
    const res = validateDomainEventDraft({
      ...draft,
      producer: { module: "reader_world", instance: "" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_ENVELOPE");
  });

  it("rejects missing security.authority", () => {
    const draft = validSessionDraft();
    const res = validateDomainEventDraft({
      ...draft,
      security: {
        principal_id: "p1",
        integrity: "local",
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_ENVELOPE");
  });

  it("rejects missing security.integrity", () => {
    const draft = validSessionDraft();
    const res = validateDomainEventDraft({
      ...draft,
      security: {
        principal_id: "p1",
        authority: "reader",
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_ENVELOPE");
  });

  it("rejects wrong authority value", () => {
    const draft = validSessionDraft();
    const res = validateDomainEventDraft({
      ...draft,
      security: {
        principal_id: "p1",
        authority: "admin",
        integrity: "local",
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_ENVELOPE");
  });

  it("rejects session payload missing book_id", () => {
    const payload = {
      book_revision: "r",
      initial_source_id: "s",
      scenario_id: "sc",
      locale: "en",
    };
    const draft = {
      ...validSessionDraft(),
      payload,
      payload_hash: payloadHash(payload),
    };
    const res = validateDomainEventDraft(draft);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_PAYLOAD");
  });

  it("rejects idea payload with extra key user_prompt", () => {
    const payload = {
      idea_id: "i1",
      idea_kind: "question",
      text: "hello",
      source_ids: ["s1"],
      evidence_refs: [],
      revision: 1,
      supersedes: null,
      user_prompt: "SECRET_PROMPT",
    };
    const draft = createDomainEventDraft({
      message_name: "reader_world.reader_idea.proposed.v1",
      experience_id: "exp1",
      correlation_id: "c1",
      producer: baseProducer,
      security: baseSecurity,
      payload: {
        idea_id: "i1",
        idea_kind: "question",
        text: "hello",
        source_ids: ["s1"],
        evidence_refs: [],
        revision: 1,
        supersedes: null,
      },
    });
    const res = validateDomainEventDraft({
      ...draft,
      payload,
      payload_hash: payloadHash(payload),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_PAYLOAD");
  });

  it("rejects unknown message_name", () => {
    const draft = validSessionDraft();
    const res = validateDomainEventDraft({
      ...draft,
      message_name: "reader_world.not_frozen.v1",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("UNKNOWN_MESSAGE_NAME");
  });

  it("accepts createDomainEventDraft output (hash precomputed)", () => {
    const draft = validSessionDraft();
    expect(draft.payload_hash).toMatch(/^[a-f0-9]{64}$/);
    const res = validateDomainEventDraft(draft);
    expect(res.ok).toBe(true);
  });
});
