/**
 * T010 / A005 committed-world browser contract.
 *
 * This stays separate from T009's AgentTurn contract: T009 proves the
 * authoritative action commit; this spec proves that committed fact becomes
 * a visible inline world with its causal actors.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

const MARKET_SOURCE_ID = "smith.b1.c3.market_extent";
const ACTION_TEXT = "修条路，把货卖到隔壁城去";

type WorldSnapshot = {
  event_count: number;
  command_count: number;
  state_hash: string | null;
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
  __T010_WORLD_LAYOUT__?: WorldLayoutSample[];
};

type WorldLayoutSample = {
  state: string | null;
  width: number;
  height: number;
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
      throw new Error(`T010 needs the T009 test bridge method: ${methodName}`);
    }
    return await bridge[methodName]();
  }, method)) as T;
}

async function resetPlayableBaseline(page: Page) {
  await page.goto("/");
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

async function submitTextAction(page: Page): Promise<number> {
  const input = page.getByTestId("discussion-input-market");
  await expect(input).toBeVisible();
  await input.fill(ACTION_TEXT);
  const scrollBeforeCommit = await page.evaluate(() => window.scrollY);
  await page.getByTestId("discussion-ask-market").click();
  await expect(page.getByTestId("agent-turn-companion-line")).toBeVisible({
    timeout: 15_000,
  });
  return scrollBeforeCommit;
}

async function expectNoActionApprovalUi(page: Page) {
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
}

async function installWorldLayoutProbe(page: Page) {
  await page.evaluate(() => {
    const w = window as TestWindow;
    const samples: WorldLayoutSample[] = [];
    w.__T010_WORLD_LAYOUT__ = samples;

    let observed: Element | null = null;
    const sample = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const next: WorldLayoutSample = {
        state: element.getAttribute("data-state"),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      const previous = samples[samples.length - 1];
      if (
        !previous ||
        previous.state !== next.state ||
        previous.width !== next.width ||
        previous.height !== next.height
      ) {
        samples.push(next);
      }
    };

    const connect = () => {
      const element = document.querySelector(
        '[data-testid="world-action-surface"]',
      );
      if (!element || element === observed) return;
      observed = element;
      sample(element);
      new MutationObserver(() => sample(element)).observe(element, {
        attributes: true,
        attributeFilter: ["data-state"],
      });
      new ResizeObserver(() => sample(element)).observe(element);
    };

    new MutationObserver(connect).observe(document.body, {
      childList: true,
      subtree: true,
    });
    connect();
  });
}

async function expectCommittedProjection(
  world: Locator,
  committed: WorldSnapshot,
) {
  expect(committed.metrics).not.toBeNull();
  const metrics = committed.metrics!;
  const metricRows = world.locator('[data-testid^="world-metric-"]');
  await expect(metricRows).toHaveCount(4);
  const metricValues = await metricRows.evaluateAll((nodes) =>
    nodes.map((node) => ({
      key: node.getAttribute("data-metric-key"),
      value: node.getAttribute("data-metric-value"),
    })),
  );
  expect(metricValues.map((row) => row.key).sort()).toEqual([
    "cash",
    "demand",
    "inventory",
    "supply",
  ]);
  const expected = {
    supply: metrics.output,
    inventory: metrics.stock,
    demand: metrics.reachable_orders,
    cash: metrics.cash,
  };
  for (const row of metricValues) {
    expect(row.value).not.toBeNull();
    expect(Number(row.value)).toBe(expected[row.key as keyof typeof expected]);
  }

  const eventRows = world.locator('[data-testid^="world-event-row-"]');
  await expect(eventRows).toHaveCount(4);
  const eventValues = await eventRows.evaluateAll((nodes) =>
    nodes.map((node) => ({
      sequence: node.getAttribute("data-event-sequence"),
      actor: node.getAttribute("data-actor-id"),
      worldRevision: node.getAttribute("data-world-revision"),
    })),
  );
  expect(eventValues).toEqual([
    {
      sequence: "0",
      actor: "merchant",
      worldRevision: String(committed.world_revision),
    },
    {
      sequence: "1",
      actor: "shepherd",
      worldRevision: String(committed.world_revision),
    },
    {
      sequence: "2",
      actor: "spinner",
      worldRevision: String(committed.world_revision),
    },
    {
      sequence: "3",
      actor: "weaver",
      worldRevision: String(committed.world_revision),
    },
  ]);
}

test.beforeEach(async ({ page }) => {
  await installAgentTurnProviderMock(page);
});

test.describe("A005 / T010 committed-world visual continuation", () => {
  test("committed action opens the world surface and exposes the four causal actors", async ({
    page,
  }) => {
    await resetPlayableBaseline(page);
    await installWorldLayoutProbe(page);
    const scrollBeforeCommit = await submitTextAction(page);
    const committed = await bridgeCall<WorldSnapshot>(page, "snapshot");
    expect(committed.last?.mode).toBe("act");
    expect(committed.last?.action).toBe("expand_market");
    expect(committed.world_revision).not.toBeNull();

    const world = page.getByTestId("world-action-surface");
    await expect(world).toHaveCount(1);
    await expect(world).toBeVisible({ timeout: 15_000 });
    const sourceOrder = await page
      .locator(
        '[data-testid="source-block-division"], [data-testid="world-action-surface"], [data-testid="source-block-market"]',
      )
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-testid")),
      );
    expect(sourceOrder).toEqual([
      "source-block-division",
      "world-action-surface",
      "source-block-market",
    ]);
    await expect(world).toHaveAttribute(
      "data-world-revision",
      String(committed.world_revision),
    );
    await expect(world).toHaveAttribute("data-state", "open");
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBe(scrollBeforeCommit);
    const actorIds = await world
      .locator('[data-testid^="world-actor-"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-actor-id")),
      );
    expect(actorIds).toEqual(["merchant", "shepherd", "spinner", "weaver"]);
    await expectCommittedProjection(world, committed);

    const layout = await page.evaluate(
      () => (window as TestWindow).__T010_WORLD_LAYOUT__ ?? [],
    );
    const loadingIndex = layout.findIndex((sample) => sample.state === "loading");
    const openIndex = layout.findIndex((sample) => sample.state === "open");
    expect(loadingIndex).toBeGreaterThanOrEqual(0);
    expect(openIndex).toBeGreaterThan(loadingIndex);
    expect(layout[loadingIndex]?.height).toBe(layout[openIndex]?.height);
    expect(layout[loadingIndex]?.width).toBe(layout[openIndex]?.width);

    await expectNoActionApprovalUi(page);
    const committedBeforeCollapse = await bridgeCall<WorldSnapshot>(
      page,
      "snapshot",
    );
    const actorStateBeforeCollapse = await world
      .locator('[data-testid^="world-actor-"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          actorId: node.getAttribute("data-actor-id"),
          text: node.textContent?.replace(/\s+/g, " ").trim() ?? "",
        })),
      );
    const eventRowsBeforeCollapse = await world
      .locator('[data-testid^="world-event-row-"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          testId: node.getAttribute("data-testid"),
          actorId: node.getAttribute("data-actor-id"),
          sequence: node.getAttribute("data-event-sequence"),
          streamVersion: node.getAttribute("data-stream-version"),
          worldRevision: node.getAttribute("data-world-revision"),
          text: node.textContent?.replace(/\s+/g, " ").trim() ?? "",
        })),
      );

    await page.getByTestId("world-collapse").click();
    await expect(world).toHaveCount(1);
    const sourceOrderAfterCollapse = await page
      .locator(
        '[data-testid="source-block-division"], [data-testid="world-action-surface"], [data-testid="source-block-market"]',
      )
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-testid")),
      );
    expect(sourceOrderAfterCollapse).toEqual(sourceOrder);
    await expect(world).toBeHidden();
    await expect(page.getByTestId("world-reopen")).toBeVisible();
    await page.getByTestId("world-reopen").click();
    await expect(world).toBeVisible();
    await expect(world).toHaveCount(1);
    await expect(world).toHaveAttribute(
      "data-state",
      "open",
    );
    await expect(world).toHaveAttribute(
      "data-world-revision",
      String(committedBeforeCollapse.world_revision),
    );
    await expect(world.locator('[data-testid^="world-event-row-"]')).toHaveCount(
      eventRowsBeforeCollapse.length,
    );

    const actorStateAfterReopen = await world
      .locator('[data-testid^="world-actor-"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          actorId: node.getAttribute("data-actor-id"),
          text: node.textContent?.replace(/\s+/g, " ").trim() ?? "",
        })),
      );
    expect(actorStateAfterReopen).toEqual(actorStateBeforeCollapse);
    const eventRowsAfterReopen = await world
      .locator('[data-testid^="world-event-row-"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          testId: node.getAttribute("data-testid"),
          actorId: node.getAttribute("data-actor-id"),
          sequence: node.getAttribute("data-event-sequence"),
          streamVersion: node.getAttribute("data-stream-version"),
          worldRevision: node.getAttribute("data-world-revision"),
          text: node.textContent?.replace(/\s+/g, " ").trim() ?? "",
        })),
      );
    expect(eventRowsAfterReopen).toEqual(eventRowsBeforeCollapse);

    const committedAfterReopen = await bridgeCall<WorldSnapshot>(
      page,
      "snapshot",
    );
    expect(committedAfterReopen.world_revision).toBe(
      committedBeforeCollapse.world_revision,
    );
    expect(committedAfterReopen.event_count).toBe(
      committedBeforeCollapse.event_count,
    );
    expect(committedAfterReopen.command_count).toBe(
      committedBeforeCollapse.command_count,
    );
    expect(committedAfterReopen.state_hash).toBe(
      committedBeforeCollapse.state_hash,
    );
    expect(committedAfterReopen.last).toEqual(committedBeforeCollapse.last);

    await expectNoActionApprovalUi(page);
  });
});
