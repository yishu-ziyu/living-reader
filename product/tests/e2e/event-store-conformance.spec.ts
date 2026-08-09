/**
 * IndexedDB EventStore conformance via Playwright bridge.
 * Mirrors tests/unit/event-store/conformance/event-store-conformance.ts cases.
 * Bridge returns plain JSON { ok, value } | { ok: false, error: { code, message, current_version? } }.
 */
import { expect, test, type Page } from "@playwright/test";
import {
  createDomainEventDraft,
  installTestSources,
  payloadHash,
  type DomainEventDraft,
} from "@/modules/reader-world/events";

const PRINCIPAL = "principal_conformance_e2e";
const EXP_BASE = "exp_conformance_e2e";

type BridgeError = {
  code: string;
  message: string;
  current_version?: number;
  details?: Record<string, unknown>;
};

type BridgeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: BridgeError };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBridge = any;

const security = {
  principal_id: PRINCIPAL,
  authority: "reader" as const,
  integrity: "local" as const,
};
const producer = { module: "reader_world" as const, instance: "e2e_conformance" };

function sessionDraft(experience_id: string, book_id = "book_e2e"): DomainEventDraft {
  return createDomainEventDraft({
    message_name: "reader_world.reading_session.opened.v1",
    experience_id,
    correlation_id: "corr_e2e_conf",
    producer,
    security,
    payload: {
      book_id,
      book_revision: "r1",
      initial_source_id: "s1",
      scenario_id: "sc",
      locale: "en",
    },
  });
}

function ideaDraft(experience_id: string, idea_id: string): DomainEventDraft {
  return createDomainEventDraft({
    message_name: "reader_world.reader_idea.proposed.v1",
    experience_id,
    correlation_id: "corr_e2e_conf",
    producer,
    security,
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

async function waitForBridge(page: Page) {
  await page.waitForFunction(
    () => {
      const b = (window as unknown as { __T003_EVENT_STORE__?: { ready?: boolean } })
        .__T003_EVENT_STORE__;
      return b != null && b.ready === true;
    },
    { timeout: 30_000 },
  );
}

async function resetStore(page: Page) {
  await page.evaluate(async () => {
    const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
      .__T003_EVENT_STORE__;
    await bridge.deleteDatabase();
    await bridge.openStore();
  });
}

test.describe("T003 IndexedDB EventStore conformance", () => {
  test.beforeEach(async ({ page }) => {
    installTestSources({
      idPrefix: "msg_e2e_conf_",
      fixedTime: "2026-08-08T12:00:00.000Z",
    });
    await page.goto("/");
    await waitForBridge(page);
    await resetStore(page);
  });

  test.afterEach(async ({ page }) => {
    installTestSources().reset();
    try {
      await page.evaluate(async () => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__?: AnyBridge })
          .__T003_EVENT_STORE__;
        if (bridge) {
          bridge.setTestAbortBeforePut?.(false);
          await bridge.deleteDatabase();
        }
      });
    } catch {
      /* ignore */
    }
  });

  test("empty stream accepts expected_version -1 only", async ({ page }) => {
    const exp = `${EXP_BASE}_empty`;
    const badDraft = sessionDraft(exp);
    const goodDraft = sessionDraft(exp);

    const bad = (await page.evaluate(
      async ({ experience_id, principal_id, draft }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.append({
          experience_id,
          principal_id,
          idempotency_key: "empty-bad",
          expected_version: 0,
          events: [draft],
        });
      },
      { experience_id: exp, principal_id: PRINCIPAL, draft: badDraft },
    )) as BridgeResult<{ committed_version: number }>;

    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe("EXPECTED_VERSION_MISMATCH");
    expect(bad.error.current_version).toBe(0);

    const good = (await page.evaluate(
      async ({ experience_id, principal_id, draft }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.append({
          experience_id,
          principal_id,
          idempotency_key: "empty-good",
          expected_version: -1,
          events: [draft],
        });
      },
      { experience_id: exp, principal_id: PRINCIPAL, draft: goodDraft },
    )) as BridgeResult<{
      previous_version: number;
      committed_version: number;
      duplicate: boolean;
    }>;

    expect(good.ok).toBe(true);
    if (!good.ok) return;
    expect(good.value.previous_version).toBe(-1);
    expect(good.value.committed_version).toBe(1);
    expect(good.value.duplicate).toBe(false);
  });

  test("same key + same payload → duplicate=true, count stable", async ({ page }) => {
    const exp = `${EXP_BASE}_dup`;
    const draft = sessionDraft(exp);
    const req = {
      experience_id: exp,
      principal_id: PRINCIPAL,
      idempotency_key: "dup-key",
      expected_version: -1,
      events: [draft],
    };

    const first = (await page.evaluate(async (r) => {
      const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
        .__T003_EVENT_STORE__;
      return bridge.append(r);
    }, req)) as BridgeResult<{
      duplicate: boolean;
      previous_version: number;
      committed_version: number;
      message_ids: string[];
      payload_hashes: string[];
    }>;
    const second = (await page.evaluate(async (r) => {
      const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
        .__T003_EVENT_STORE__;
      return bridge.append(r);
    }, req)) as BridgeResult<{
      duplicate: boolean;
      previous_version: number;
      committed_version: number;
      message_ids: string[];
      payload_hashes: string[];
    }>;

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.duplicate).toBe(false);
    expect(second.value.duplicate).toBe(true);
    expect(second.value.previous_version).toBe(first.value.previous_version);
    expect(second.value.committed_version).toBe(first.value.committed_version);
    expect(second.value.message_ids).toEqual(first.value.message_ids);
    expect(second.value.payload_hashes).toEqual(first.value.payload_hashes);

    const ver = (await page.evaluate(async (id) => {
      const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
        .__T003_EVENT_STORE__;
      return bridge.getVersion(id);
    }, exp)) as BridgeResult<number>;
    expect(ver.ok && ver.value).toBe(1);
  });

  test("same key + different payload → IDEMPOTENCY_KEY_REUSED", async ({ page }) => {
    const exp = `${EXP_BASE}_reuse`;
    const d1 = sessionDraft(exp, "book_a");
    const d2 = sessionDraft(exp, "book_b");
    d2.payload = { ...d2.payload, book_id: "book_b_other" };
    d2.payload_hash = payloadHash(d2.payload);

    await page.evaluate(
      async ({ experience_id, principal_id, draft }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.append({
          experience_id,
          principal_id,
          idempotency_key: "reuse-key",
          expected_version: -1,
          events: [draft],
        });
      },
      { experience_id: exp, principal_id: PRINCIPAL, draft: d1 },
    );

    const bad = (await page.evaluate(
      async ({ experience_id, principal_id, draft }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.append({
          experience_id,
          principal_id,
          idempotency_key: "reuse-key",
          expected_version: 1,
          events: [draft],
        });
      },
      { experience_id: exp, principal_id: PRINCIPAL, draft: d2 },
    )) as BridgeResult<unknown>;

    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe("IDEMPOTENCY_KEY_REUSED");

    const ver = (await page.evaluate(async (id) => {
      const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
        .__T003_EVENT_STORE__;
      return bridge.getVersion(id);
    }, exp)) as BridgeResult<number>;
    expect(ver.ok && ver.value).toBe(1);
  });

  test("expected_version mismatch includes current_version number", async ({
    page,
  }) => {
    const exp = `${EXP_BASE}_ver`;
    await page.evaluate(
      async ({ experience_id, principal_id, draft }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.append({
          experience_id,
          principal_id,
          idempotency_key: "open",
          expected_version: -1,
          events: [draft],
        });
      },
      { experience_id: exp, principal_id: PRINCIPAL, draft: sessionDraft(exp) },
    );

    const conflict = (await page.evaluate(
      async ({ experience_id, principal_id, draft }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.append({
          experience_id,
          principal_id,
          idempotency_key: "wrong-ver",
          expected_version: -1,
          events: [draft],
        });
      },
      {
        experience_id: exp,
        principal_id: PRINCIPAL,
        draft: ideaDraft(exp, "i1"),
      },
    )) as BridgeResult<unknown>;

    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.error.code).toBe("EXPECTED_VERSION_MISMATCH");
    expect(typeof conflict.error.current_version).toBe("number");
    expect(conflict.error.current_version).toBe(1);
  });

  test("multi-event batch event_index_in_commit 0..n-1", async ({ page }) => {
    const exp = `${EXP_BASE}_batch`;
    await page.evaluate(
      async ({ experience_id, principal_id, draft }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.append({
          experience_id,
          principal_id,
          idempotency_key: "open",
          expected_version: -1,
          events: [draft],
        });
      },
      { experience_id: exp, principal_id: PRINCIPAL, draft: sessionDraft(exp) },
    );

    const a = ideaDraft(exp, "a");
    const b = ideaDraft(exp, "b");
    const c = ideaDraft(exp, "c");

    const res = (await page.evaluate(
      async ({ experience_id, principal_id, events }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.append({
          experience_id,
          principal_id,
          idempotency_key: "batch-3",
          expected_version: 1,
          events,
        });
      },
      { experience_id: exp, principal_id: PRINCIPAL, events: [a, b, c] },
    )) as BridgeResult<{ committed_version: number }>;

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.committed_version).toBe(4);

    const loaded = (await page.evaluate(async (id) => {
      const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
        .__T003_EVENT_STORE__;
      return bridge.load(id);
    }, exp)) as BridgeResult<
      Array<{ stream_version: number; event_index_in_commit: number }>
    >;
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

  test("race: concurrent same expected_version → one ok, one mismatch", async ({
    page,
  }) => {
    const exp = `${EXP_BASE}_race`;
    const d1 = sessionDraft(exp, "race_a");
    const d2 = sessionDraft(exp, "race_b");

    const pair = (await page.evaluate(
      async ({ experience_id, principal_id, draftA, draftB }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return Promise.all([
          bridge.append({
            experience_id,
            principal_id,
            idempotency_key: "race-a",
            expected_version: -1,
            events: [draftA],
          }),
          bridge.append({
            experience_id,
            principal_id,
            idempotency_key: "race-b",
            expected_version: -1,
            events: [draftB],
          }),
        ]);
      },
      {
        experience_id: exp,
        principal_id: PRINCIPAL,
        draftA: d1,
        draftB: d2,
      },
    )) as [
      BridgeResult<{ duplicate: boolean; committed_version: number }>,
      BridgeResult<{ duplicate: boolean; committed_version: number }>,
    ];

    const oks = pair.filter((r) => r.ok);
    const fails = pair.filter((r) => !r.ok);
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

    const loaded = (await page.evaluate(async (id) => {
      const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
        .__T003_EVENT_STORE__;
      return bridge.load(id);
    }, exp)) as BridgeResult<Array<{ stream_version: number }>>;
    expect(loaded.ok && loaded.value.length).toBe(1);
    if (!loaded.ok) return;
    expect(loaded.value[0].stream_version).toBe(1);

    const ver = (await page.evaluate(async (id) => {
      const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
        .__T003_EVENT_STORE__;
      return bridge.getVersion(id);
    }, exp)) as BridgeResult<number>;
    expect(ver.ok && ver.value).toBe(1);
  });

  test("fault: __testAbortBeforePut → zero half-writes", async ({ page }) => {
    const exp = `${EXP_BASE}_fault`;
    const draft = sessionDraft(exp);

    const bad = (await page.evaluate(
      async ({ experience_id, principal_id, draft: d }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        bridge.setTestAbortBeforePut(true);
        const res = await bridge.append({
          experience_id,
          principal_id,
          idempotency_key: "fault-key",
          expected_version: -1,
          events: [d],
        });
        bridge.setTestAbortBeforePut(false);
        return res;
      },
      { experience_id: exp, principal_id: PRINCIPAL, draft },
    )) as BridgeResult<unknown>;

    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe("STORE_UNAVAILABLE");

    const ver = (await page.evaluate(async (id) => {
      const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
        .__T003_EVENT_STORE__;
      return bridge.getVersion(id);
    }, exp)) as BridgeResult<number>;
    expect(ver.ok && ver.value).toBe(0);

    const loaded = (await page.evaluate(async (id) => {
      const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
        .__T003_EVENT_STORE__;
      return bridge.load(id);
    }, exp)) as BridgeResult<unknown[]>;
    expect(loaded.ok && loaded.value.length).toBe(0);

    const receipt = (await page.evaluate(
      async ({ principal_id, experience_id }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.getIdempotencyReceipt(
          principal_id,
          experience_id,
          "fault-key",
        );
      },
      { principal_id: PRINCIPAL, experience_id: exp },
    )) as BridgeResult<unknown>;
    expect(receipt.ok && receipt.value).toBeNull();
  });

  test("fault: duplicate message_id unique index → zero half-writes", async ({
    page,
  }) => {
    const exp = `${EXP_BASE}_msgid`;
    const first = sessionDraft(exp);

    const firstRes = (await page.evaluate(
      async ({ experience_id, principal_id, draft }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.append({
          experience_id,
          principal_id,
          idempotency_key: "msgid-first",
          expected_version: -1,
          events: [draft],
        });
      },
      { experience_id: exp, principal_id: PRINCIPAL, draft: first },
    )) as BridgeResult<unknown>;
    expect(firstRes.ok).toBe(true);

    const conflict = ideaDraft(exp, "conflict");
    (conflict as { message_id: string }).message_id = first.message_id;

    const bad = (await page.evaluate(
      async ({ experience_id, principal_id, draft }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.append({
          experience_id,
          principal_id,
          idempotency_key: "msgid-conflict",
          expected_version: 1,
          events: [draft],
        });
      },
      { experience_id: exp, principal_id: PRINCIPAL, draft: conflict },
    )) as BridgeResult<unknown>;

    expect(bad.ok).toBe(false);

    const ver = (await page.evaluate(async (id) => {
      const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
        .__T003_EVENT_STORE__;
      return bridge.getVersion(id);
    }, exp)) as BridgeResult<number>;
    expect(ver.ok && ver.value).toBe(1);

    const loaded = (await page.evaluate(async (id) => {
      const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
        .__T003_EVENT_STORE__;
      return bridge.load(id);
    }, exp)) as BridgeResult<unknown[]>;
    expect(loaded.ok && loaded.value.length).toBe(1);

    const receipt = (await page.evaluate(
      async ({ principal_id, experience_id }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.getIdempotencyReceipt(
          principal_id,
          experience_id,
          "msgid-conflict",
        );
      },
      { principal_id: PRINCIPAL, experience_id: exp },
    )) as BridgeResult<unknown>;
    expect(receipt.ok && receipt.value).toBeNull();
  });
});
