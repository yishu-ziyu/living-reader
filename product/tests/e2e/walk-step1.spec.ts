/**
 * T072 gate evidence: static readability, then keyboard walking.
 * Temporary during T072 review; folds into inline-world.spec.ts once gated.
 */
import { expect, test, type Page } from "@playwright/test";

type TestWindow = Window & {
  __T009_AGENT_TURN__?: {
    ready: boolean;
    resetBaseline: () => Promise<void>;
  };
};

const MARKET_SOURCE_ID = "smith.b1.c3.market_extent";
const ACTION_TEXT = "修条路，把货卖到隔壁城去";

const actionCandidate = {
  mode: "act",
  intent_class: "executable_action",
  relevance: "mechanism_adjacent",
  confidence: "high",
  target_source_ids: [MARKET_SOURCE_ID],
  evidence_refs: [],
  open_question: null,
  companion_line: "好，路往隔壁城铺。",
  proposed_action_id: "expand_market",
  pending_action_id: null,
  reason_codes: ["clear_allowlisted_action"],
};

async function openWorld(page: Page) {
  await page.route("**/api/agent-turn", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, candidate: actionCandidate }),
    });
  });

  await page.goto("/test-harness");
  await expect(page.getByTestId("reading-shell")).toBeVisible();
  await page.waitForFunction(
    () => (window as TestWindow).__T009_AGENT_TURN__?.ready === true,
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate(async () => {
    await (window as TestWindow).__T009_AGENT_TURN__!.resetBaseline();
  });
  await expect(page.getByTestId("session-root")).toHaveAttribute(
    "data-session-state",
    "active.playable",
  );

  const input = page.getByTestId("discussion-input-market");
  await expect(input).toBeVisible();
  await input.fill(ACTION_TEXT);
  await page.getByTestId("discussion-ask-market").click();

  await expect(page.getByTestId("walk-view")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("world-construction-stage")).toHaveText(
    "世界可以操作",
    { timeout: 20_000 },
  );
}

test("gate 1: the grid scene renders with one clear subject", async ({ page }) => {
  await openWorld(page);
  const grid = page.getByTestId("walk-grid");
  await expect(grid).toBeVisible();
  await expect(page.getByTestId("walk-avatar")).toBeVisible();

  await grid.scrollIntoViewIfNeeded();
  await grid.screenshot({ path: "test-results/walk-gate1-100.png" });

  await page.setViewportSize({ width: 720, height: 900 });
  await grid.scrollIntoViewIfNeeded();
  await grid.screenshot({ path: "test-results/walk-gate1-200.png" });
});

test("gate 1: two places drawn from the same art are told apart at rest", async ({
  page,
}) => {
  await openWorld(page);
  const pasture = page.getByTestId("walk-drawable-building-pasture-fence");
  const road = page.getByTestId("walk-drawable-building-road-gate");

  // Both draw fence.png, so shape alone cannot separate them. The locked road
  // is unreachable, so it can never earn a focus label: it must read as locked
  // without being walked to.
  await expect(road).toHaveAttribute("data-locked", "true");
  await expect(pasture).toHaveAttribute("data-locked", "false");
  await expect(page.getByTestId("walk-locked-marker-road")).toBeVisible();
});

test("gate 2+3: arrow keys move the avatar and arriving changes the place", async ({
  page,
}) => {
  await openWorld(page);
  const grid = page.getByTestId("walk-grid");
  const cell = page.getByTestId("walk-avatar-cell");

  await expect(cell).toHaveAttribute("data-avatar-x", "5");
  await expect(cell).toHaveAttribute("data-avatar-y", "3");
  await expect(cell).toHaveAttribute("data-current-place-id", "");

  await grid.focus();
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await page.keyboard.press("ArrowUp");

  await expect(cell).toHaveAttribute("data-avatar-x", "9");
  await expect(cell).toHaveAttribute("data-avatar-y", "2");
  await expect(cell).toHaveAttribute("data-current-place-id", "market");
  await expect(page.getByTestId("walk-current-place")).toHaveText("村落市集");
  await grid.screenshot({ path: "test-results/walk-gate3-market.png" });
});

test("gate 4: the locked road blocks with a visible reason", async ({ page }) => {
  await openWorld(page);
  const grid = page.getByTestId("walk-grid");
  const cell = page.getByTestId("walk-avatar-cell");

  await grid.focus();
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(cell).toHaveAttribute("data-avatar-x", "9");

  await page.keyboard.press("ArrowRight");
  await expect(cell).toHaveAttribute("data-avatar-x", "9");
  await expect(cell).toHaveAttribute("data-avatar-y", "3");
  await expect(page.getByTestId("walk-blocked-reason")).toContainText(
    "还没修通",
  );
  await grid.screenshot({ path: "test-results/walk-gate4-locked.png" });
});
