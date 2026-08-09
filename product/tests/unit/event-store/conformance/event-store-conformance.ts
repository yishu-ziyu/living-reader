/**
 * Shared EventStore conformance suite.
 * Memory: vitest unit via runEventStoreConformance.
 * IndexedDB: same cases in Playwright e2e (bridge + serializable results).
 */
import { afterEach, describe, expect, it } from "vitest";
import type {
  AppendEventsRequest,
  AppendReceipt,
  EventStore,
} from "@/modules/reader-world/event-store/port";
import type { StoreResult } from "@/modules/reader-world/event-store/errors";
import {
  createDomainEventDraft,
  installTestSources,
  payloadHash,
  type DomainEventDraft,
} from "@/modules/reader-world/events";

export const CONFORMANCE_PRINCIPAL = "principal_conformance";
export const CONFORMANCE_EXPERIENCE = "exp_conformance_001";

const security = {
  principal_id: CONFORMANCE_PRINCIPAL,
  authority: "reader" as const,
  integrity: "local" as const,
};
const producer = { module: "reader_world" as const, instance: "conformance" };

/** Build a reading_session.opened draft (unique message_id each call). */
export function conformanceSessionDraft(
  experience_id: string = CONFORMANCE_EXPERIENCE,
  book_id: string = "book_conformance",
): DomainEventDraft {
  return createDomainEventDraft({
    message_name: "reader_world.reading_session.opened.v1",
    experience_id,
    correlation_id: "corr_conformance",
    producer,
    security: { ...security, principal_id: CONFORMANCE_PRINCIPAL },
    payload: {
      book_id,
      book_revision: "r1",
      initial_source_id: "s1",
      scenario_id: "sc",
      locale: "en",
    },
  });
}

/** Build a reader_idea.proposed draft. */
export function conformanceIdeaDraft(
  experience_id: string,
  idea_id: string,
): DomainEventDraft {
  return createDomainEventDraft({
    message_name: "reader_world.reader_idea.proposed.v1",
    experience_id,
    correlation_id: "corr_conformance",
    producer,
    security: { ...security, principal_id: CONFORMANCE_PRINCIPAL },
    payload: {
      idea_id,
      idea_kind: "hypothesis",
      text: `idea ${idea_id}`,
      source_ids: [],
      evidence_refs: [],
      revision: 1,
      supersedes: null,
    },
  });
}

export type InjectFaultHooks = {
  /**
   * Cause a mid-commit / atomic failure for a known idempotency key.
   * After this resolves, events and receipts for that key must be absent.
   */
  runFailingAppend: (
    store: EventStore,
  ) => Promise<StoreResult<AppendReceipt>>;
  /** Identity used by runFailingAppend (for clean-state assertions). */
  expectClean: {
    experience_id: string;
    principal_id: string;
    idempotency_key: string;
  };
};

export type EventStoreConformanceOptions = {
  /** Default true. Concurrent same expected_version race. */
  supportsConcurrentRace?: boolean;
  /**
   * When true, suite asserts duplicate message_id fails with zero half-writes.
   * IndexedDB has a unique index; Memory may gain this via F23.
   */
  supportsMessageIdUniqueness?: boolean;
  /**
   * Optional fault injection (e.g. IDB __testAbortBeforePut).
   * When set, suite verifies zero half-writes after the forced failure.
   */
  injectFault?: InjectFaultHooks;
};

/**
 * Vitest describe factory — run the full EventStore contract against `createStore`.
 */
export function runEventStoreConformance(
  name: string,
  createStore: () => EventStore | Promise<EventStore>,
  options?: EventStoreConformanceOptions,
): void {
  const supportsRace = options?.supportsConcurrentRace !== false;
  const supportsMsgId = options?.supportsMessageIdUniqueness === true;

  describe(`EventStore conformance: ${name}`, () => {
    afterEach(() => {
      installTestSources().reset();
    });

    it("empty stream accepts expected_version -1 only", async () => {
      installTestSources({ idPrefix: "msg_conf_empty_" });
      const store = await createStore();
      const exp = `${CONFORMANCE_EXPERIENCE}_empty`;

      const bad = await store.append({
        experience_id: exp,
        principal_id: CONFORMANCE_PRINCIPAL,
        idempotency_key: "empty-bad",
        expected_version: 0,
        events: [conformanceSessionDraft(exp)],
      });
      expect(bad.ok).toBe(false);
      if (bad.ok) return;
      expect(bad.error.code).toBe("EXPECTED_VERSION_MISMATCH");
      expect(bad.error.current_version).toBe(0);

      const good = await store.append({
        experience_id: exp,
        principal_id: CONFORMANCE_PRINCIPAL,
        idempotency_key: "empty-good",
        expected_version: -1,
        events: [conformanceSessionDraft(exp)],
      });
      expect(good.ok).toBe(true);
      if (!good.ok) return;
      expect(good.value.previous_version).toBe(-1);
      expect(good.value.committed_version).toBe(1);
      expect(good.value.duplicate).toBe(false);
    });

    it("same key + same payload → duplicate=true, count stable, receipt fields restored", async () => {
      installTestSources({ idPrefix: "msg_conf_dup_" });
      const store = await createStore();
      const exp = `${CONFORMANCE_EXPERIENCE}_dup`;
      const draft = conformanceSessionDraft(exp);
      const req: AppendEventsRequest = {
        experience_id: exp,
        principal_id: CONFORMANCE_PRINCIPAL,
        idempotency_key: "dup-key",
        expected_version: -1,
        events: [draft],
      };

      const first = await store.append(req);
      const second = await store.append(req);
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;

      expect(first.value.duplicate).toBe(false);
      expect(second.value.duplicate).toBe(true);
      expect(second.value.previous_version).toBe(first.value.previous_version);
      expect(second.value.committed_version).toBe(first.value.committed_version);
      expect(second.value.message_ids).toEqual(first.value.message_ids);
      expect(second.value.payload_hashes).toEqual(first.value.payload_hashes);
      expect(second.value.payload_hashes[0]).toMatch(/^[a-f0-9]{64}$/);

      const loaded = await store.load(exp);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      expect(loaded.value).toHaveLength(1);

      const ver = await store.getVersion(exp);
      expect(ver.ok && ver.value).toBe(1);
    });

    it("same key + different payload → IDEMPOTENCY_KEY_REUSED", async () => {
      installTestSources({ idPrefix: "msg_conf_reuse_" });
      const store = await createStore();
      const exp = `${CONFORMANCE_EXPERIENCE}_reuse`;
      const d1 = conformanceSessionDraft(exp, "book_a");
      const d2 = conformanceSessionDraft(exp, "book_b");
      d2.payload = { ...d2.payload, book_id: "book_b_other" };
      d2.payload_hash = payloadHash(d2.payload);

      await store.append({
        experience_id: exp,
        principal_id: CONFORMANCE_PRINCIPAL,
        idempotency_key: "reuse-key",
        expected_version: -1,
        events: [d1],
      });

      const bad = await store.append({
        experience_id: exp,
        principal_id: CONFORMANCE_PRINCIPAL,
        idempotency_key: "reuse-key",
        expected_version: 1,
        events: [d2],
      });
      expect(bad.ok).toBe(false);
      if (bad.ok) return;
      expect(bad.error.code).toBe("IDEMPOTENCY_KEY_REUSED");

      const ver = await store.getVersion(exp);
      expect(ver.ok && ver.value).toBe(1);
      const loaded = await store.load(exp);
      expect(loaded.ok && loaded.value.length).toBe(1);
    });

    it("expected_version mismatch → EXPECTED_VERSION_MISMATCH with current_version", async () => {
      installTestSources({ idPrefix: "msg_conf_ver_" });
      const store = await createStore();
      const exp = `${CONFORMANCE_EXPERIENCE}_ver`;

      await store.append({
        experience_id: exp,
        principal_id: CONFORMANCE_PRINCIPAL,
        idempotency_key: "open",
        expected_version: -1,
        events: [conformanceSessionDraft(exp)],
      });

      const conflict = await store.append({
        experience_id: exp,
        principal_id: CONFORMANCE_PRINCIPAL,
        idempotency_key: "wrong-ver",
        expected_version: -1,
        events: [conformanceIdeaDraft(exp, "i1")],
      });
      expect(conflict.ok).toBe(false);
      if (conflict.ok) return;
      expect(conflict.error.code).toBe("EXPECTED_VERSION_MISMATCH");
      expect(typeof conflict.error.current_version).toBe("number");
      expect(conflict.error.current_version).toBe(1);
    });

    it("multi-event batch assigns event_index_in_commit 0..n-1", async () => {
      installTestSources({ idPrefix: "msg_conf_batch_" });
      const store = await createStore();
      const exp = `${CONFORMANCE_EXPERIENCE}_batch`;

      const open = conformanceSessionDraft(exp);
      await store.append({
        experience_id: exp,
        principal_id: CONFORMANCE_PRINCIPAL,
        idempotency_key: "open",
        expected_version: -1,
        events: [open],
      });

      const a = conformanceIdeaDraft(exp, "a");
      const b = conformanceIdeaDraft(exp, "b");
      const c = conformanceIdeaDraft(exp, "c");
      const res = await store.append({
        experience_id: exp,
        principal_id: CONFORMANCE_PRINCIPAL,
        idempotency_key: "batch-3",
        expected_version: 1,
        events: [a, b, c],
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.committed_version).toBe(4);

      const loaded = await store.load(exp);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      expect(loaded.value).toHaveLength(4);
      expect(loaded.value[1].event_index_in_commit).toBe(0);
      expect(loaded.value[2].event_index_in_commit).toBe(1);
      expect(loaded.value[3].event_index_in_commit).toBe(2);
      expect(loaded.value[1].stream_version).toBe(2);
      expect(loaded.value[2].stream_version).toBe(3);
      expect(loaded.value[3].stream_version).toBe(4);
    });

    it("invalid second event in batch writes zero events and zero receipts", async () => {
      installTestSources({ idPrefix: "msg_conf_atomic_" });
      const store = await createStore();
      const exp = `${CONFORMANCE_EXPERIENCE}_atomic_batch`;

      const good = conformanceSessionDraft(exp);
      const bad = conformanceIdeaDraft(exp, "x");
      // Force envelope mismatch so validation fails before commit.
      (bad as { experience_id: string }).experience_id = "other_exp";

      const res = await store.append({
        experience_id: exp,
        principal_id: CONFORMANCE_PRINCIPAL,
        idempotency_key: "atomic-batch",
        expected_version: -1,
        events: [good, bad],
      });
      expect(res.ok).toBe(false);

      const ver = await store.getVersion(exp);
      expect(ver.ok && ver.value).toBe(0);
      const loaded = await store.load(exp);
      expect(loaded.ok && loaded.value.length).toBe(0);
      const receipt = await store.getIdempotencyReceipt(
        CONFORMANCE_PRINCIPAL,
        exp,
        "atomic-batch",
      );
      expect(receipt.ok && receipt.value).toBeNull();
    });

    if (supportsRace) {
      it("race: concurrent same expected_version → one ok, one mismatch; monotonic version", async () => {
        installTestSources({ idPrefix: "msg_conf_race_" });
        const store = await createStore();
        const exp = `${CONFORMANCE_EXPERIENCE}_race`;

        const d1 = conformanceSessionDraft(exp, "race_a");
        const d2 = conformanceSessionDraft(exp, "race_b");

        const [r1, r2] = await Promise.all([
          store.append({
            experience_id: exp,
            principal_id: CONFORMANCE_PRINCIPAL,
            idempotency_key: "race-a",
            expected_version: -1,
            events: [d1],
          }),
          store.append({
            experience_id: exp,
            principal_id: CONFORMANCE_PRINCIPAL,
            idempotency_key: "race-b",
            expected_version: -1,
            events: [d2],
          }),
        ]);

        const results = [r1, r2];
        const oks = results.filter((r) => r.ok);
        const fails = results.filter((r) => !r.ok);
        expect(oks).toHaveLength(1);
        expect(fails).toHaveLength(1);
        if (oks.length !== 1 || fails.length !== 1) return;

        const winner = oks[0];
        const loser = fails[0];
        if (!winner.ok || loser.ok) return;

        expect(winner.value.duplicate).toBe(false);
        expect(winner.value.committed_version).toBe(1);
        expect(loser.error.code).toBe("EXPECTED_VERSION_MISMATCH");
        expect(typeof loser.error.current_version).toBe("number");

        const loaded = await store.load(exp);
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        // Winner's batch size only once (single-event batches → count 1).
        expect(loaded.value).toHaveLength(1);
        expect(loaded.value[0].stream_version).toBe(1);

        const ver = await store.getVersion(exp);
        expect(ver.ok && ver.value).toBe(1);

        // Monotonic, no gap: versions are exactly 1..n
        const versions = loaded.value.map((e) => e.stream_version).sort((a, b) => a - b);
        versions.forEach((v, i) => expect(v).toBe(i + 1));
      });
    }

    if (supportsMsgId) {
      it("duplicate message_id fails with zero half-writes", async () => {
        installTestSources({ idPrefix: "msg_conf_msgid_" });
        const store = await createStore();
        const exp = `${CONFORMANCE_EXPERIENCE}_msgid`;

        const first = conformanceSessionDraft(exp);
        const firstRes = await store.append({
          experience_id: exp,
          principal_id: CONFORMANCE_PRINCIPAL,
          idempotency_key: "msgid-first",
          expected_version: -1,
          events: [first],
        });
        expect(firstRes.ok).toBe(true);

        // Reuse message_id with a different idempotency key and new payload.
        const conflict = conformanceIdeaDraft(exp, "conflict");
        (conflict as { message_id: string }).message_id = first.message_id;

        const bad = await store.append({
          experience_id: exp,
          principal_id: CONFORMANCE_PRINCIPAL,
          idempotency_key: "msgid-conflict",
          expected_version: 1,
          events: [conflict],
        });
        expect(bad.ok).toBe(false);

        const ver = await store.getVersion(exp);
        expect(ver.ok && ver.value).toBe(1);
        const loaded = await store.load(exp);
        expect(loaded.ok && loaded.value.length).toBe(1);
        const receipt = await store.getIdempotencyReceipt(
          CONFORMANCE_PRINCIPAL,
          exp,
          "msgid-conflict",
        );
        expect(receipt.ok && receipt.value).toBeNull();
      });
    }

    if (options?.injectFault) {
      const fault = options.injectFault;
      it("fault injection: zero half-writes (events and receipts)", async () => {
        installTestSources({ idPrefix: "msg_conf_fault_" });
        const store = await createStore();

        const res = await fault.runFailingAppend(store);
        expect(res.ok).toBe(false);

        const { experience_id, principal_id, idempotency_key } = fault.expectClean;
        const ver = await store.getVersion(experience_id);
        expect(ver.ok && ver.value).toBe(0);
        const loaded = await store.load(experience_id);
        expect(loaded.ok && loaded.value.length).toBe(0);
        const receipt = await store.getIdempotencyReceipt(
          principal_id,
          experience_id,
          idempotency_key,
        );
        expect(receipt.ok && receipt.value).toBeNull();
      });
    }
  });
}
