/**
 * T010 / A009 evidence and return-to-source browser contract.
 *
 * The action is submitted through the visible market discussion composer. The
 * test bridge only resets a deterministic committed baseline; EvidenceBlock
 * itself must render from the committed world projection.
 */
import { expect, test, type Page } from "@playwright/test";

const MARKET_SOURCE_ID = "smith.b1.c3.market_extent";
const ACTION_TEXT = "修条路，把货卖到隔壁城去";

type WorldSnapshot = {
  world_revision: number | null;
  metrics: {
    output: number;
    stock: number;
    reachable_orders: number;
    cash: number;
  } | null;
  last: {
    mode: "discuss" | "clarify" | "act" | "stop";
    action: "deepen_specialization" | "expand_market" | null;
  } | null;
};

type AgentTurnBridge = {
  ready: boolean;
  resetBaseline: () => Promise<void>;
  snapshot: () => Promise<WorldSnapshot>;
};

type TestWindow = Window & {
  __T009_AGENT_TURN__?: AgentTurnBridge;
};

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

const clarifyCandidate = {
  ...actionCandidate,
  mode: "clarify",
  intent_class: "source_question",
  companion_line: "我还没接上这一步，世界先不动。",
  proposed_action_id: null,
  reason_codes: ["fixture_fallback"],
};

async function installAgentTurnProviderMock(page: Page) {
  await page.route("**/api/agent-turn", async (route) => {
    const body = route.request().postDataJSON() as {
      turn?: { final_text?: unknown; active_source_ids?: unknown };
    };
    const turn = body.turn;
    const matchesAction =
      turn?.final_text === ACTION_TEXT &&
      Array.isArray(turn.active_source_ids) &&
      turn.active_source_ids[0] === MARKET_SOURCE_ID;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        candidate: matchesAction ? actionCandidate : clarifyCandidate,
      }),
    });
  });
}

async function bridgeCall<T>(
  page: Page,
  method: "resetBaseline" | "snapshot",
): Promise<T> {
  return (await page.evaluate(async (methodName) => {
    const bridge = (window as TestWindow).__T009_AGENT_TURN__;
    if (!bridge || typeof bridge[methodName] !== "function") {
      throw new Error(`T010 evidence needs bridge method: ${methodName}`);
    }
    return await bridge[methodName]();
  }, method)) as T;
}

async function resetPlayableBaseline(page: Page) {
  await page.goto("/test-harness");
  await expect(page.getByTestId("reading-shell")).toBeVisible();
  await page.waitForFunction(
    () => (window as TestWindow).__T009_AGENT_TURN__?.ready === true,
    undefined,
    { timeout: 5_000 },
  );
  await bridgeCall(page, "resetBaseline");
  await expect(page.getByTestId("session-root")).toHaveAttribute(
    "data-session-state",
    "active.playable",
  );
}

async function submitTextAction(page: Page) {
  const input = page.getByTestId("discussion-input-market");
  await expect(input).toBeVisible();
  await input.fill(ACTION_TEXT);
  await page.getByTestId("discussion-ask-market").click();
  await expect(page.getByTestId("agent-turn-companion-line")).toBeVisible({
    timeout: 15_000,
  });
  const committed = await bridgeCall<WorldSnapshot>(page, "snapshot");
  expect(committed.last?.mode).toBe("act");
  expect(committed.last?.action).toBe("expand_market");
  expect(committed.world_revision).not.toBeNull();
  return committed;
}

async function expectNoWorldApprovalUi(page: Page) {
  await expect(
    page.locator(
      [
        '[data-testid*="world-open"]',
        '[data-testid*="view-world"]',
        '[data-testid*="world-view"]',
        '[data-testid*="world-fullscreen"]',
        '[data-testid*="world-preview"]',
        '[data-testid*="world-approval"]',
        '[data-testid*="world-impact"]',
        '[data-testid*="world-confirm"]',
        '[data-testid*="action-preview"]',
        '[data-testid*="preview"]',
        '[data-testid*="approval"]',
        '[data-testid*="impact-list"]',
        '[data-testid*="execute-confirm"]',
        '[data-testid*="是否执行"]',
      ].join(", "),
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /查看世界|审批|动作预览|影响清单|是否执行|全屏/,
    }),
  ).toHaveCount(0);
}

async function expectEvidenceExactness(page: Page, committed: WorldSnapshot) {
  const source = page.getByTestId("source-block-market");
  const sourceQuote = await page
    .getByTestId("source-block-market-quote")
    .locator("span:not(.inline-margin-note)")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? "").join(""));
  const sourceLocator = await source.getAttribute("data-source-locator");
  expect(sourceLocator).toBe("Smith_0206-01_251");

  const world = page.getByTestId("world-action-surface");
  const eventRow = world.locator('[data-testid^="world-event-row-"]').first();
  await expect(eventRow).toBeVisible();
  const eventSummary = await eventRow.locator("p").innerText();
  const eventMeta = await eventRow.evaluate((node) => ({
    actor: node.getAttribute("data-actor-id"),
    sequence: node.getAttribute("data-event-sequence"),
    worldRevision: node.getAttribute("data-world-revision"),
  }));

  const evidence = page.getByTestId("evidence-block");
  await expect(evidence).toBeVisible();
  await expect(evidence).toHaveAttribute("data-source-id", MARKET_SOURCE_ID);
  await expect(evidence).toHaveAttribute("data-source-locator", sourceLocator!);
  await expect(evidence).toHaveJSProperty("open", false);
  await expect(evidence.locator('[data-evidence-field="quote"]')).toBeHidden();
  await expect(evidence.locator('[data-evidence-field="event"]')).toBeHidden();

  await page.getByTestId("evidence-toggle").click();
  await expect(evidence).toHaveJSProperty("open", true);
  await expect(evidence.locator('[data-evidence-field="quote"]')).toBeVisible();
  await expect(evidence.locator('[data-evidence-field="quote"]')).toHaveText(
    sourceQuote,
  );

  const evidenceEvent = evidence.locator('[data-evidence-field="event"]');
  await expect(evidenceEvent).toBeVisible();
  await expect(evidenceEvent.locator("p")).toHaveText(eventSummary);
  await expect(evidenceEvent).toHaveAttribute("data-actor-id", eventMeta.actor!);
  await expect(evidenceEvent).toHaveAttribute(
    "data-event-sequence",
    eventMeta.sequence!,
  );
  await expect(evidenceEvent).toHaveAttribute(
    "data-world-revision",
    String(committed.world_revision),
  );
  await expect(eventRow).toHaveAttribute("data-actor-id", eventMeta.actor!);
  await expect(eventRow).toHaveAttribute(
    "data-event-sequence",
    eventMeta.sequence!,
  );
  await expect(eventRow).toHaveAttribute(
    "data-world-revision",
    String(committed.world_revision),
  );

  await expect(page.getByTestId("evidence-runtime")).toBeVisible();
  await expect(page.getByTestId("evidence-world-revision")).toHaveText(
    String(committed.world_revision),
  );
  await expect(page.getByTestId("evidence-ruleset-id")).toHaveText(
    "wool-town-v1",
  );
  await expect(page.getByTestId("evidence-seed")).toHaveText("42");
}

test.beforeEach(async ({ page }) => {
  await installAgentTurnProviderMock(page);
});

test.describe("T010 / A009 EvidenceBlock and source return", () => {
  test.describe.configure({ timeout: 30_000 });

  test("committed event exposes exact market evidence and returns to its SourceBlock", async ({
    page,
  }) => {
    await resetPlayableBaseline(page);
    const committed = await submitTextAction(page);
    await expectEvidenceExactness(page, committed);

    const returnToMarket = page.getByTestId("evidence-return-source");
    await expect(returnToMarket).toBeVisible();
    await returnToMarket.click();
    await expect(page.getByTestId("source-block-market")).toBeFocused();
    await expectNoWorldApprovalUi(page);
  });

  test("collapsing the inline world restores the market SourceBlock focus", async ({
    page,
  }) => {
    await resetPlayableBaseline(page);
    await submitTextAction(page);

    const world = page.getByTestId("world-action-surface");
    await expect(world).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("world-collapse").click();
    await expect(world).toBeHidden();
    await expect(page.getByTestId("source-block-market")).toBeFocused();
  });

  test("reduced motion keeps the committed world and evidence understandable", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await resetPlayableBaseline(page);
    const committed = await submitTextAction(page);

    await expect(page.getByTestId("world-action-surface")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("world-action-surface")).toHaveAttribute(
      "data-state",
      "open",
    );
    await expect(page.getByTestId("evidence-block")).toBeVisible();
    await expect(
      page.getByTestId("world-action-surface").locator('[data-testid^="world-actor-"]'),
    ).toHaveCount(4);
    await expect(page.getByTestId("world-action-surface")).toHaveAttribute(
      "data-world-revision",
      String(committed.world_revision),
    );
    expect(
      await page.evaluate(() =>
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);
    await expectNoWorldApprovalUi(page);
  });
});
