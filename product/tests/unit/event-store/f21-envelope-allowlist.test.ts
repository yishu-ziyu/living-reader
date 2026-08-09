/**
 * F21 rework: exact allowlists on root envelope, producer, security.
 * Unknown keys must fail; Memory append must not persist credentials.
 */
import { describe, expect, it, afterEach } from "vitest";
import { InMemoryEventStore } from "@/infrastructure/event-store/memory";
import {
  createDomainEventDraft,
  installTestSources,
  payloadHash,
  validateDomainEventDraft,
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

function sessionDraft() {
  return createDomainEventDraft({
    message_name: "reader_world.reading_session.opened.v1",
    experience_id: FIXTURE_EXPERIENCE_ID,
    correlation_id: "corr_f21_env",
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

describe("F21 envelope/producer/security exact allowlists", () => {
  afterEach(() => {
    installTestSources().reset();
  });

  it("rejects top-level raw_audio with structured INVALID_ENVELOPE", () => {
    const draft = sessionDraft();
    const dirty = { ...draft, raw_audio: "SECRET_AUDIO" };
    const res = validateDomainEventDraft(dirty);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("INVALID_ENVELOPE");
      expect(res.error.details?.unknown).toEqual(
        expect.arrayContaining(["raw_audio"]),
      );
    }
  });

  it("rejects producer.provider_credential", () => {
    const draft = sessionDraft();
    const res = validateDomainEventDraft({
      ...draft,
      producer: {
        module: "reader_world",
        instance: "unit",
        provider_credential: "SECRET_CREDENTIAL",
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("INVALID_ENVELOPE");
      expect(res.error.details?.unknown).toEqual(
        expect.arrayContaining(["provider_credential"]),
      );
    }
  });

  it("rejects security.credential", () => {
    const draft = sessionDraft();
    const res = validateDomainEventDraft({
      ...draft,
      security: {
        principal_id: FIXTURE_PRINCIPAL_ID,
        authority: "reader",
        integrity: "local",
        credential: "SECRET_CREDENTIAL",
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("INVALID_ENVELOPE");
      expect(res.error.details?.unknown).toEqual(
        expect.arrayContaining(["credential"]),
      );
    }
  });

  it("Memory append rejects top-level raw_audio (zero events written)", async () => {
    const store = new InMemoryEventStore();
    const draft = sessionDraft();
    const dirty = {
      ...draft,
      raw_audio: "SECRET_AUDIO",
    } as typeof draft & { raw_audio: string };

    const res = await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "open-raw-audio",
      expected_version: -1,
      events: [dirty as never],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_ENVELOPE");

    const loaded = await store.load(FIXTURE_EXPERIENCE_ID);
    expect(loaded.ok && loaded.value).toEqual([]);
    const ver = await store.getVersion(FIXTURE_EXPERIENCE_ID);
    expect(ver.ok && ver.value).toBe(0);
  });

  it("Memory append rejects producer.provider_credential", async () => {
    const store = new InMemoryEventStore();
    const draft = sessionDraft();
    const dirty = {
      ...draft,
      producer: {
        ...draft.producer,
        provider_credential: "SECRET_CREDENTIAL",
      },
    };

    const res = await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "open-cred",
      expected_version: -1,
      events: [dirty as never],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_ENVELOPE");

    const loaded = await store.load(FIXTURE_EXPERIENCE_ID);
    expect(loaded.ok && loaded.value).toEqual([]);
  });

  it("Memory append rejects security.credential", async () => {
    const store = new InMemoryEventStore();
    const draft = sessionDraft();
    const dirty = {
      ...draft,
      security: {
        ...draft.security,
        credential: "SECRET_CREDENTIAL",
      },
    };

    const res = await store.append({
      experience_id: FIXTURE_EXPERIENCE_ID,
      principal_id: FIXTURE_PRINCIPAL_ID,
      idempotency_key: "open-sec-cred",
      expected_version: -1,
      events: [dirty as never],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_ENVELOPE");
  });

  it("still accepts exact allowlist (optional authentication_context on security)", () => {
    const draft = sessionDraft();
    const withAuth = {
      ...draft,
      security: {
        ...draft.security,
        authentication_context: "opaque_ctx",
      },
    };
    // payload_hash is over payload only; envelope extra security field ok
    const res = validateDomainEventDraft(withAuth);
    expect(res.ok).toBe(true);
  });

  it("payload hash still required independently of allowlist", () => {
    const draft = sessionDraft();
    const { payload_hash: _, ...noHash } = draft;
    void _;
    expect(validateDomainEventDraft(noHash).ok).toBe(false);
    expect(payloadHash(draft.payload)).toMatch(/^[a-f0-9]{64}$/);
  });
});
