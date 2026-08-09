/**
 * F21 + F25 real Chromium negatives:
 * - envelope unknown keys rejected by IndexedDB append
 * - world metrics secret aliases rejected; never in exportDebugTrace
 */
import { expect, test, type Page } from "@playwright/test";
import {
  createDomainEventDraft,
  installTestSources,
  payloadHash,
} from "@/modules/reader-world/events";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBridge = any;

type StoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

const EXP = "exp_f21_f25_e2e";
const PRINCIPAL = "principal_f21_f25";

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

function buildSessionDraft() {
  const { reset } = installTestSources({
    idPrefix: "msg_e2e_",
    fixedTime: "2026-08-08T12:00:00.000Z",
  });
  const draft = createDomainEventDraft({
    message_name: "reader_world.reading_session.opened.v1",
    experience_id: EXP,
    correlation_id: "corr_e2e_f21",
    producer: { module: "reader_world", instance: "e2e" },
    security: {
      principal_id: PRINCIPAL,
      authority: "reader",
      integrity: "local",
    },
    payload: {
      book_id: "book",
      book_revision: "r1",
      initial_source_id: "s1",
      scenario_id: "sc",
      locale: "en",
    },
  });
  reset();
  return draft;
}

function buildWorldDraft(metrics: Record<string, unknown>) {
  const { reset } = installTestSources({
    idPrefix: "msg_e2e_w_",
    fixedTime: "2026-08-08T12:00:00.000Z",
  });
  const base = createDomainEventDraft({
    message_name: "reader_world.world.event_recorded.v1",
    experience_id: EXP,
    correlation_id: "corr_e2e_f25",
    producer: { module: "reader_world", instance: "e2e" },
    security: {
      principal_id: PRINCIPAL,
      authority: "reader",
      integrity: "local",
    },
    payload: {
      world_id: "w1",
      world_revision: 1,
      event_kind: "tick",
      summary: "ok",
      actor_id: null,
      metrics: { demand: 1, supply: 1 },
    },
  });
  const payload = {
    world_id: "w1",
    world_revision: 1,
    event_kind: "tick",
    summary: "ok",
    actor_id: null as string | null,
    metrics,
  };
  reset();
  return {
    ...base,
    payload,
    payload_hash: payloadHash(payload),
  };
}

test.describe("F21/F25 IndexedDB security allowlists", () => {
  test("rejects top-level raw_audio and producer/security credentials", async ({
    page,
  }) => {
    const base = buildSessionDraft();

    await page.goto("/test-harness");
    await waitForBridge(page);
    await page.evaluate(async () => {
      const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
        .__T003_EVENT_STORE__;
      await bridge.deleteDatabase();
      await bridge.openStore();
    });

    const cases = [
      {
        name: "raw_audio",
        draft: { ...base, raw_audio: "SECRET_AUDIO" },
      },
      {
        name: "producer_credential",
        draft: {
          ...base,
          message_id: base.message_id + "_p",
          producer: {
            ...base.producer,
            provider_credential: "SECRET_CREDENTIAL",
          },
        },
      },
      {
        name: "security_credential",
        draft: {
          ...base,
          message_id: base.message_id + "_s",
          security: {
            ...base.security,
            credential: "SECRET_CREDENTIAL",
          },
        },
      },
    ];

    for (const c of cases) {
      const res = (await page.evaluate(
        async ({ experience_id, principal_id, draft, key }) => {
          const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
            .__T003_EVENT_STORE__;
          return bridge.append({
            experience_id,
            principal_id,
            idempotency_key: `f21-${key}`,
            expected_version: -1,
            events: [draft],
          });
        },
        {
          experience_id: EXP,
          principal_id: PRINCIPAL,
          draft: c.draft,
          key: c.name,
        },
      )) as StoreResult<unknown>;

      expect(res.ok, c.name).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("INVALID_ENVELOPE");
      }
    }

    const version = (await page.evaluate(async (experience_id) => {
      const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
        .__T003_EVENT_STORE__;
      return bridge.getVersion(experience_id);
    }, EXP)) as StoreResult<number>;
    expect(version.ok && version.value).toBe(0);
  });

  test("rejects metrics secret aliases (primitive/nested/case) and keeps trace clean", async ({
    page,
  }) => {
    const open = buildSessionDraft();

    await page.goto("/test-harness");
    await waitForBridge(page);
    await page.evaluate(async () => {
      const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
        .__T003_EVENT_STORE__;
      await bridge.deleteDatabase();
      await bridge.openStore();
    });

    // Valid open so stream exists
    const openRes = (await page.evaluate(
      async ({ experience_id, principal_id, draft }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.append({
          experience_id,
          principal_id,
          idempotency_key: "open-ok",
          expected_version: -1,
          events: [draft],
        });
      },
      { experience_id: EXP, principal_id: PRINCIPAL, draft: open },
    )) as StoreResult<{ committed_version: number }>;
    expect(openRes.ok).toBe(true);

    const metricCases: Array<{ name: string; metrics: Record<string, unknown> }> =
      [
        {
          name: "primitive_aliases",
          metrics: {
            demand: 1,
            user_prompt: "SECRET_PROMPT",
            provider_credential: "SECRET_CREDENTIAL",
            rawAudio: "SECRET_AUDIO",
          },
        },
        {
          name: "case_variants",
          metrics: {
            demand: 1,
            User_Prompt: "SECRET_PROMPT",
            PROVIDER_CREDENTIAL: "SECRET_CREDENTIAL",
            RawAudio: "SECRET_AUDIO",
          },
        },
        {
          name: "nested_object",
          metrics: {
            demand: 1,
            leak: { user_prompt: "SECRET_PROMPT" },
          },
        },
        {
          name: "nested_array",
          metrics: {
            demand: 1,
            score: ["SECRET_PROMPT"],
          },
        },
      ];

    for (const c of metricCases) {
      const draft = buildWorldDraft(c.metrics);
      const res = (await page.evaluate(
        async ({ experience_id, principal_id, draft, key }) => {
          const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
            .__T003_EVENT_STORE__;
          return bridge.append({
            experience_id,
            principal_id,
            idempotency_key: `f25-${key}`,
            expected_version: 1,
            events: [draft],
          });
        },
        {
          experience_id: EXP,
          principal_id: PRINCIPAL,
          draft,
          key: c.name,
        },
      )) as StoreResult<unknown>;

      expect(res.ok, c.name).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("INVALID_PAYLOAD");
      }
    }

    // Valid metrics append + export must be clean
    const good = buildWorldDraft({ demand: 10, supply: 3, score: 1, label: "ok" });
    const goodRes = (await page.evaluate(
      async ({ experience_id, principal_id, draft }) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.append({
          experience_id,
          principal_id,
          idempotency_key: "world-good",
          expected_version: 1,
          events: [draft],
        });
      },
      { experience_id: EXP, principal_id: PRINCIPAL, draft: good },
    )) as StoreResult<unknown>;
    expect(goodRes.ok).toBe(true);

    const trace = (await page.evaluate(async (experience_id) => {
      const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
        .__T003_EVENT_STORE__;
      return bridge.exportDebugTrace(experience_id);
    }, EXP)) as StoreResult<string>;

    expect(trace.ok).toBe(true);
    if (!trace.ok) return;
    const json = trace.value;
    for (const s of [
      "SECRET_PROMPT",
      "SECRET_CREDENTIAL",
      "SECRET_AUDIO",
      "user_prompt",
      "provider_credential",
      "rawAudio",
      "User_Prompt",
      "PROVIDER_CREDENTIAL",
    ]) {
      expect(json).not.toContain(s);
    }
  });
});
