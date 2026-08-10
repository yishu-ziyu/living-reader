import { chromium } from "@playwright/test";
import path from "node:path";
import { mkdirSync } from "node:fs";

const baseURL = process.env.WALK_BASE_URL ?? "http://127.0.0.1:3005";
const outDir = path.resolve("tools/walk-step1");
mkdirSync(outDir, { recursive: true });

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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

await page.route("**/api/agent-turn", async (route) => {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ ok: true, candidate: actionCandidate }),
  });
});

await page.goto(`${baseURL}/test-harness`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="reading-shell"]', { timeout: 30_000 });
await page.waitForFunction(() => window.__T009_AGENT_TURN__?.ready === true, null, {
  timeout: 15_000,
});
await page.evaluate(async () => {
  await window.__T009_AGENT_TURN__.resetBaseline();
});
await page.waitForSelector('[data-session-state="active.playable"]', { timeout: 15_000 });

// Ensure world is open / committed path exercised.
const input = page.getByTestId("discussion-input-market");
if (await input.count()) {
  await input.fill(ACTION_TEXT);
  await page.getByTestId("discussion-ask-market").click();
}

await page.waitForSelector('[data-testid="walk-view"]', { timeout: 20_000 });
const walk = page.getByTestId("walk-view");
await walk.scrollIntoViewIfNeeded();

await page.screenshot({
  path: path.join(outDir, "step1-100.png"),
  fullPage: false,
});
await walk.screenshot({ path: path.join(outDir, "step1-walk-100.png") });

await page.setViewportSize({ width: 1440, height: 1100 });
await page.evaluate(() => {
  document.documentElement.style.zoom = "2";
});
await walk.scrollIntoViewIfNeeded();
await page.screenshot({
  path: path.join(outDir, "step1-200.png"),
  fullPage: false,
});
await walk.screenshot({ path: path.join(outDir, "step1-walk-200.png") });

const info = await page.evaluate(() => {
  const walkEl = document.querySelector('[data-testid="walk-view"]');
  const place = document.querySelector('[data-testid="walk-current-place"]')?.textContent ?? "";
  const cell = document.querySelector('[data-testid="walk-avatar-cell"]')?.textContent ?? "";
  const drawables = [...document.querySelectorAll("[data-drawable-id]")].map((node) => ({
    id: node.getAttribute("data-drawable-id"),
    kind: node.getAttribute("data-kind"),
    text: node.textContent?.trim(),
  }));
  return {
    hasWalk: Boolean(walkEl),
    place,
    cell,
    drawables,
  };
});

console.log(JSON.stringify({ outDir, info }, null, 2));
await browser.close();
