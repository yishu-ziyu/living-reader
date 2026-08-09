/**
 * T003 IndexedDB EventStore e2e — real Chromium persistence + projection rebuild.
 * Requires NEXT_PUBLIC_T003_BRIDGE=1 (see playwright.config.ts webServer).
 */
import { expect, test, type Page } from "@playwright/test";
import {
  FIXTURE_EXPERIENCE_ID,
  FIXTURE_PRINCIPAL_ID,
  withFixedScenarioDrafts,
} from "../fixtures/event-store/scenario-sequence";

type StoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

/** Runtime bridge shape (implemented by T003EventStoreTestBridge). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBridge = any;

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

test.describe("T003 IndexedDB EventStore", () => {
  test("persists across reload, rebuilds projections, redacts debug trace", async ({
    page,
  }) => {
    const { drafts, reset } = withFixedScenarioDrafts();
    try {
      await page.goto("/test-harness");
      await expect(page.getByTestId("reading-shell")).toBeVisible();
      await waitForBridge(page);

      // Clean slate
      await page.evaluate(async () => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        await bridge.deleteDatabase();
        await bridge.openStore();
      });

      const scenario = await page.evaluate(
        async ({ experience_id, principal_id, drafts: d }) => {
          const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
            .__T003_EVENT_STORE__;
          return bridge.runScenario({
            experience_id,
            principal_id,
            drafts: d,
          });
        },
        {
          experience_id: FIXTURE_EXPERIENCE_ID,
          principal_id: FIXTURE_PRINCIPAL_ID,
          drafts,
        },
      );

      expect(scenario).toMatchObject({ ok: true });
      const sc = scenario as {
        ok: true;
        event_count: number;
        version: StoreResult<number>;
        rebuilt: StoreResult<{
          reading_hash: string;
          world_hash: string;
        }>;
      };
      expect(sc.event_count).toBe(drafts.length);
      expect(sc.version.ok && sc.version.value).toBe(drafts.length);
      expect(sc.rebuilt.ok).toBe(true);
      if (!sc.rebuilt.ok) return;

      const readingHashBefore = sc.rebuilt.value.reading_hash;
      const worldHashBefore = sc.rebuilt.value.world_hash;
      expect(readingHashBefore).toMatch(/^[a-f0-9]{64}$/);
      expect(worldHashBefore).toMatch(/^[a-f0-9]{64}$/);

      // Receipt present
      const receipt = (await page.evaluate(
        async ({ principal_id, experience_id }) => {
          const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
            .__T003_EVENT_STORE__;
          return bridge.getIdempotencyReceipt(
            principal_id,
            experience_id,
            "scenario-step-0",
          );
        },
        {
          principal_id: FIXTURE_PRINCIPAL_ID,
          experience_id: FIXTURE_EXPERIENCE_ID,
        },
      )) as StoreResult<{
        committed_version: number;
        message_ids: string[];
      } | null>;
      expect(receipt.ok).toBe(true);
      if (!receipt.ok) return;
      expect(receipt.value).not.toBeNull();
      expect(receipt.value!.committed_version).toBe(1);
      expect(receipt.value!.message_ids.length).toBe(1);

      // Reload page — IndexedDB must retain events + projections
      await page.reload();
      await expect(page.getByTestId("reading-shell")).toBeVisible();
      await waitForBridge(page);
      await page.evaluate(async () => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        await bridge.openStore();
      });

      const afterReload = await page.evaluate(async (experience_id) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        const version = await bridge.getVersion(experience_id);
        const loaded = await bridge.load(experience_id);
        const projections = await bridge.loadProjections(experience_id);
        return { version, loaded, projections };
      }, FIXTURE_EXPERIENCE_ID);

      const ver = afterReload.version as StoreResult<number>;
      const loaded = afterReload.loaded as StoreResult<unknown[]>;
      const projections = afterReload.projections as StoreResult<{
        reading_hash: string;
        world_hash: string;
      } | null>;

      expect(ver.ok && ver.value).toBe(drafts.length);
      expect(loaded.ok && loaded.value.length).toBe(drafts.length);
      expect(projections.ok).toBe(true);
      if (!projections.ok || !projections.value) {
        throw new Error("projections missing after reload");
      }
      expect(projections.value.reading_hash).toBe(readingHashBefore);
      expect(projections.value.world_hash).toBe(worldHashBefore);

      // clearProjections + rebuild → identical hashes; events untouched
      const rebuildResult = await page.evaluate(async (experience_id) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        const cleared = await bridge.clearProjections(experience_id);
        const empty = await bridge.loadProjections(experience_id);
        const rebuilt = await bridge.rebuildFromEvents(experience_id);
        const version = await bridge.getVersion(experience_id);
        const events = await bridge.load(experience_id);
        return { cleared, empty, rebuilt, version, events };
      }, FIXTURE_EXPERIENCE_ID);

      expect((rebuildResult.cleared as StoreResult<true>).ok).toBe(true);
      const empty = rebuildResult.empty as StoreResult<null>;
      expect(empty.ok && empty.value).toBeNull();

      const rebuilt = rebuildResult.rebuilt as StoreResult<{
        reading_hash: string;
        world_hash: string;
      }>;
      expect(rebuilt.ok).toBe(true);
      if (!rebuilt.ok) return;
      expect(rebuilt.value.reading_hash).toBe(readingHashBefore);
      expect(rebuilt.value.world_hash).toBe(worldHashBefore);

      const verAfter = rebuildResult.version as StoreResult<number>;
      const eventsAfter = rebuildResult.events as StoreResult<unknown[]>;
      expect(verAfter.ok && verAfter.value).toBe(drafts.length);
      expect(eventsAfter.ok && eventsAfter.value.length).toBe(drafts.length);

      // Debug trace must not leak secrets
      const traceRes = (await page.evaluate(async (experience_id) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.exportDebugTrace(experience_id);
      }, FIXTURE_EXPERIENCE_ID)) as StoreResult<string>;
      expect(traceRes.ok).toBe(true);
      if (!traceRes.ok) return;
      const json = traceRes.value.toLowerCase();
      expect(json).not.toContain("authentication_context");
      expect(json).not.toContain("prompt");
      expect(json).not.toContain("credential");
      expect(json).not.toContain("raw_audio");

      // Home shell still healthy
      await expect(page.getByTestId("world-slot")).toHaveAttribute(
        "data-state",
        "closed",
      );
      await expect(page.getByTestId("world-slot")).toBeHidden();
    } finally {
      reset();
      try {
        await page.evaluate(async () => {
          const bridge = (window as unknown as { __T003_EVENT_STORE__?: AnyBridge })
            .__T003_EVENT_STORE__;
          if (bridge) await bridge.deleteDatabase();
        });
      } catch {
        /* ignore */
      }
    }
  });

  test("idempotent append returns duplicate without growing stream", async ({
    page,
  }) => {
    const { drafts, reset } = withFixedScenarioDrafts();
    try {
      await page.goto("/test-harness");
      await waitForBridge(page);
      await page.evaluate(async () => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        await bridge.deleteDatabase();
        await bridge.openStore();
      });

      const draft = drafts[0];
      const req = {
        experience_id: FIXTURE_EXPERIENCE_ID,
        principal_id: FIXTURE_PRINCIPAL_ID,
        idempotency_key: "open-once",
        expected_version: -1,
        events: [draft],
      };

      const first = (await page.evaluate(async (r) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.append(r);
      }, req)) as StoreResult<{
        duplicate: boolean;
        committed_version: number;
      }>;
      const second = (await page.evaluate(async (r) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.append(r);
      }, req)) as StoreResult<{
        duplicate: boolean;
        committed_version: number;
      }>;

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(first.value.duplicate).toBe(false);
      expect(second.value.duplicate).toBe(true);
      expect(second.value.committed_version).toBe(
        first.value.committed_version,
      );

      const ver = (await page.evaluate(async (id) => {
        const bridge = (window as unknown as { __T003_EVENT_STORE__: AnyBridge })
          .__T003_EVENT_STORE__;
        return bridge.getVersion(id);
      }, FIXTURE_EXPERIENCE_ID)) as StoreResult<number>;
      expect(ver.ok && ver.value).toBe(1);
    } finally {
      reset();
      try {
        await page.evaluate(async () => {
          const bridge = (window as unknown as { __T003_EVENT_STORE__?: AnyBridge })
            .__T003_EVENT_STORE__;
          if (bridge) await bridge.deleteDatabase();
        });
      } catch {
        /* ignore */
      }
    }
  });
});
