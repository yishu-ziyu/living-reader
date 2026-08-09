/**
 * T004 ReaderSession Playwright smoke.
 * Requires NEXT_PUBLIC_T004_SESSION_BRIDGE=1 (playwright.config).
 */
import { expect, test, type Page } from "@playwright/test";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBridge = any;

type Receipt = {
  accepted: boolean;
  reason_code: string;
  current_state: string;
};

async function waitForSessionBridge(page: Page) {
  await page.waitForFunction(
    () => {
      const b = (window as unknown as { __T004_SESSION__?: { ready?: boolean } })
        .__T004_SESSION__;
      return b != null && b.ready === true;
    },
    { timeout: 30_000 },
  );
}

test.describe("T004 ReaderSession", () => {
  test("initial reading + closed world; guards; happy open; stop/stale", async ({
    page,
  }) => {
    await page.goto("/test-harness");
    await expect(page.getByTestId("reading-shell")).toBeVisible();
    await expect(page.getByTestId("session-root")).toHaveAttribute(
      "data-session-state",
      "active.reading",
    );
    await expect(page.getByTestId("world-slot")).toHaveAttribute(
      "data-state",
      "closed",
    );
    await expect(page.getByTestId("world-slot")).toBeHidden();

    await waitForSessionBridge(page);

    const noOpen = (await page.evaluate(() => {
      const b = (window as unknown as { __T004_SESSION__: AnyBridge })
        .__T004_SESSION__;
      return b.send({ type: "WORLD_OPEN_REQUESTED", graph_revision: 1 });
    })) as Receipt;
    expect(noOpen.accepted).toBe(false);
    expect(noOpen.reason_code).toBe("RELATION_NOT_REVIEWED");

    // F29: production bridge must not expose raw actor
    const hasActor = await page.evaluate(() => {
      const b = (window as unknown as { __T004_SESSION__: AnyBridge })
        .__T004_SESSION__;
      return "actor" in b || "_actor" in b;
    });
    expect(hasActor).toBe(false);

    const open = (await page.evaluate(() => {
      const b = (window as unknown as { __T004_SESSION__: AnyBridge })
        .__T004_SESSION__;
      b.send({ type: "ENTER_REVIEWING_GRAPH" });
      b.send({
        type: "RELATION_REVIEWED",
        relation_id: "rel_1",
        basis_revision: 0,
      });
      b.send({
        type: "GRAPH_COMMITTED",
        graph_revision: 2,
        accepted_relation_ids: ["rel_1"],
      });
      b.send({ type: "PLAYABILITY_PASSED", graph_revision: 2 });
      return b.send({ type: "WORLD_OPEN_REQUESTED", graph_revision: 2 });
    })) as Receipt;
    expect(open.accepted).toBe(true);

    await expect(page.getByTestId("session-root")).toHaveAttribute(
      "data-session-state",
      "active.preparing_world",
    );
    await expect(page.getByTestId("world-slot")).toHaveAttribute(
      "data-state",
      "loading",
    );

    const ready = (await page.evaluate(() => {
      const b = (window as unknown as { __T004_SESSION__: AnyBridge })
        .__T004_SESSION__;
      const ctx = b.getContext() as {
        correlation_id: string;
        effect_generation: number;
      };
      return b.send({
        type: "WORLD_READY",
        correlation_id: ctx.correlation_id,
        graph_revision: 2,
        world_id: "world_e2e",
        world_revision: 1,
        effect_generation: ctx.effect_generation,
      });
    })) as Receipt;
    expect(ready.accepted).toBe(true);

    await expect(page.getByTestId("session-root")).toHaveAttribute(
      "data-session-state",
      "active.playable",
    );
    await expect(page.getByTestId("world-slot")).toHaveAttribute(
      "data-state",
      "open",
    );

    await page.evaluate(() => {
      const b = (window as unknown as { __T004_SESSION__: AnyBridge })
        .__T004_SESSION__;
      return b.send({ type: "STOP" });
    });
    await expect(page.getByTestId("session-root")).toHaveAttribute(
      "data-session-state",
      "paused",
    );

    const stale = (await page.evaluate(() => {
      const b = (window as unknown as { __T004_SESSION__: AnyBridge })
        .__T004_SESSION__;
      return b.send({
        type: "WORLD_READY",
        correlation_id: "late",
        graph_revision: 2,
        world_id: "x",
        world_revision: 1,
        effect_generation: 0,
      });
    })) as Receipt;
    expect(stale.accepted).toBe(false);
    expect(stale.reason_code).toBe("STALE_COMPLETION");
  });

  test("F27: playable/open → switch source → reading + closed/hidden + world_id null", async ({
    page,
  }) => {
    await page.goto("/test-harness");
    await waitForSessionBridge(page);

    // Split evaluates so bridge React context refreshes after WORLD_OPEN (corr/gen).
    await page.evaluate(() => {
      const b = (window as unknown as { __T004_SESSION__: AnyBridge })
        .__T004_SESSION__;
      b.send({ type: "ENTER_REVIEWING_GRAPH" });
      b.send({
        type: "RELATION_REVIEWED",
        relation_id: "rel_1",
        basis_revision: 0,
      });
      b.send({
        type: "GRAPH_COMMITTED",
        graph_revision: 2,
        accepted_relation_ids: ["rel_1"],
      });
      b.send({ type: "PLAYABILITY_PASSED", graph_revision: 2 });
      return b.send({ type: "WORLD_OPEN_REQUESTED", graph_revision: 2 });
    });

    await expect(page.getByTestId("session-root")).toHaveAttribute(
      "data-session-state",
      "active.preparing_world",
    );

    await page.evaluate(() => {
      const b = (window as unknown as { __T004_SESSION__: AnyBridge })
        .__T004_SESSION__;
      const ctx = b.getContext() as {
        correlation_id: string;
        effect_generation: number;
      };
      return b.send({
        type: "WORLD_READY",
        correlation_id: ctx.correlation_id,
        graph_revision: 2,
        world_id: "world_e2e",
        world_revision: 1,
        effect_generation: ctx.effect_generation,
      });
    });

    await expect(page.getByTestId("session-root")).toHaveAttribute(
      "data-session-state",
      "active.playable",
    );
    await expect(page.getByTestId("world-slot")).toHaveAttribute(
      "data-state",
      "open",
    );

    await page.evaluate(() => {
      const b = (window as unknown as { __T004_SESSION__: AnyBridge })
        .__T004_SESSION__;
      b.send({
        type: "SET_SOURCE_SNAPSHOT",
        experience_id: "exp_switched",
        source_snapshot_ids: ["new.source.only"],
      });
    });

    await expect(page.getByTestId("session-root")).toHaveAttribute(
      "data-session-state",
      "active.reading",
    );
    await expect(page.getByTestId("world-slot")).toHaveAttribute(
      "data-state",
      "closed",
    );
    await expect(page.getByTestId("world-slot")).toBeHidden();

    const worldId = await page.evaluate(() => {
      const b = (window as unknown as { __T004_SESSION__: AnyBridge })
        .__T004_SESSION__;
      return (b.getContext() as { world_id: string | null }).world_id;
    });
    expect(worldId).toBeNull();
  });

  test("homepage SourceBlocks and closed world still present", async ({
    page,
  }) => {
    await page.goto("/test-harness");
    await expect(page.getByTestId("reading-shell")).toBeVisible();
    await expect(page.getByTestId("source-block-division")).toBeVisible();
    await expect(page.getByTestId("world-slot")).toHaveAttribute(
      "data-state",
      "closed",
    );
  });
});
