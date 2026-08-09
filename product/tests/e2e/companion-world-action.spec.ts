/**
 * T009 / A005 browser contract.
 *
 * This spec deliberately uses the same market discussion input that already
 * exists on the reading page.  T009 must route that input and a final voice
 * transcript through one AgentTurn; it must not add a second, equally-primary
 * action composer.
 *
 * The browser bridge is test-only and env-gated (the same shape as the T003 and
 * T004 bridges).  It is an observability/fixture seam, not a production API:
 * it resets a deterministic playable wool-town baseline, exposes projections,
 * feeds a recorded final voice turn, and changes a basis to exercise the
 * fail-closed invalidation paths.  The page still submits text through the
 * visible discussion input.
 */
import { expect, test, type Page } from "@playwright/test";

type InputChannel = "text" | "voice";

type Basis = {
  experience_id: string;
  world_id: string;
  graph_revision: number;
  world_revision: number;
  ruleset_id: string;
};

type PendingIntent = {
  action_id: "deepen_specialization" | "expand_market";
  source_snapshot_id: string;
  basis: Basis;
};

type WorldMetrics = {
  output: number;
  stock: number;
  reachable_orders: number;
  cash: number;
};

type TurnSummary = {
  mode: "discuss" | "clarify" | "act" | "stop" | "invite_world";
  action: "deepen_specialization" | "expand_market" | null;
  basis: Basis | null;
  companion_line: string;
};

type CommitReceipt = {
  committed?: boolean;
  duplicate?: boolean;
  idempotency_key?: string;
};

type AgentSnapshot = {
  pending_intent: PendingIntent | null;
  event_count: number;
  command_count: number;
  world_revision: number | null;
  metrics: WorldMetrics | null;
  state_hash: string | null;
  basis_ready: boolean;
  basis_error: string | null;
  last: TurnSummary | null;
  receipt: CommitReceipt | null;
};

type BasisMutation =
  | "source"
  | "experience"
  | "graph"
  | "world"
  | "ruleset"
  | "stop";

type AgentTurnBridge = {
  ready: boolean;
  resetBaseline: () => Promise<void>;
  snapshot: () => Promise<AgentSnapshot>;
  submitFinal: (input: {
    channel: InputChannel;
    final_text: string;
    turn_id?: string;
  }) => Promise<unknown>;
  mutateBasis: (input: { kind: BasisMutation }) => Promise<void>;
};

type TestWindow = Window & {
  __T009_AGENT_TURN__?: AgentTurnBridge;
};

const ACTION_TEXT = "修条路，把货卖到隔壁城去";
const HYPOTHETICAL_TEXT = "要是能修条路通到隔壁城就好了";
const FOLLOW_UP_TEXT = "那就修";

/**
 * The test route is a recorded semantic-provider fixture, not production
 * classification. Both the visible text route and bridge-fed final voice
 * route call the same /api/agent-turn client adapter.
 */
function candidateForFixture(
  finalText: string,
  sourceId: string,
  hasPendingIntent: boolean,
) {
  const common = {
    target_source_ids: [sourceId],
    evidence_refs: [],
    open_question: null,
  };
  switch (finalText) {
    case ACTION_TEXT:
      return {
        ...common,
        mode: "act",
        intent_class: "executable_action",
        relevance: "mechanism_adjacent",
        confidence: "high",
        companion_line: "好，路往隔壁城铺。",
        proposed_action_id: "expand_market",
        pending_action_id: null,
        reason_codes: ["clear_allowlisted_action"],
      };
    case HYPOTHETICAL_TEXT:
      return {
        ...common,
        mode: "discuss",
        intent_class: "productive_detour",
        relevance: "mechanism_adjacent",
        confidence: "high",
        companion_line: "嚯，你这是惦记上隔壁城了。",
        proposed_action_id: null,
        pending_action_id: "expand_market",
        reason_codes: ["hypothetical_market_access"],
      };
    case FOLLOW_UP_TEXT:
      return hasPendingIntent
        ? {
            ...common,
            mode: "act",
            intent_class: "executable_action",
            relevance: "mechanism_adjacent",
            confidence: "high",
            companion_line: "行，开工。",
            proposed_action_id: null,
            pending_action_id: null,
            reason_codes: ["unique_pending_follow_up"],
          }
        : {
            ...common,
            mode: "clarify",
            intent_class: "source_question",
            relevance: "mechanism_adjacent",
            confidence: "high",
            companion_line: "修哪条？我还没接上你的上一句。",
            proposed_action_id: null,
            pending_action_id: null,
            reason_codes: ["missing_pending_intent"],
          };
    case "天气怎么样":
      return {
        ...common,
        mode: "discuss",
        intent_class: "obvious_off_topic_noise",
        relevance: "none",
        confidence: "high",
        companion_line: "这句先没接到当前世界。",
        proposed_action_id: null,
        pending_action_id: null,
        reason_codes: ["unrelated_topic"],
      };
    default:
      return {
        ...common,
        mode: "clarify",
        intent_class: "source_question",
        relevance: "unknown",
        confidence: "high",
        companion_line: "我还没接上这一步，世界先不动。",
        proposed_action_id: null,
        pending_action_id: null,
        reason_codes: ["fixture_fallback"],
      };
  }
}

async function installAgentTurnProviderMock(page: Page) {
  await page.route("**/api/agent-turn", async (route) => {
    const body = route.request().postDataJSON() as {
      turn?: {
        final_text?: unknown;
        active_source_ids?: unknown;
        pending_intent?: unknown;
      };
    };
    const turn = body.turn ?? {};
    const sourceId =
      Array.isArray(turn.active_source_ids) &&
      typeof turn.active_source_ids[0] === "string"
        ? turn.active_source_ids[0]
        : "smith.b1.c3.market_extent";
    const finalText =
      typeof turn.final_text === "string" ? turn.final_text : "";
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        candidate: candidateForFixture(
          finalText,
          sourceId,
          turn.pending_intent !== null && turn.pending_intent !== undefined,
        ),
      }),
    });
  });
}

/**
 * Wait for the test-only seam.  Keeping this assertion explicit means a red
 * run identifies the missing observable bridge instead of silently using an
 * implementation detail or a fake click path.
 */
async function waitForAgentBridge(page: Page) {
  await page.waitForFunction(
    () => {
      const bridge = (window as TestWindow).__T009_AGENT_TURN__;
      return (
        bridge?.ready === true &&
        typeof bridge.resetBaseline === "function" &&
        typeof bridge.snapshot === "function" &&
        typeof bridge.submitFinal === "function" &&
        typeof bridge.mutateBasis === "function"
      );
    },
    undefined,
    { timeout: 5_000 },
  );
}

async function bridgeCall<T>(
  page: Page,
  method: "resetBaseline" | "snapshot" | "submitFinal" | "mutateBasis",
  input?: unknown,
): Promise<T> {
  return (await page.evaluate(
    async ({ method: methodName, input: payload }) => {
      const bridge = (window as TestWindow).__T009_AGENT_TURN__;
      if (!bridge) {
        throw new Error(
          "T009 observable bridge missing: expected window.__T009_AGENT_TURN__",
        );
      }
      const candidate = bridge[methodName];
      if (typeof candidate !== "function") {
        throw new Error(`T009 bridge method missing: ${methodName}`);
      }
      const callable = candidate as (input?: unknown) => Promise<unknown>;
      return await callable.call(bridge, payload);
    },
    { method, input },
  )) as T;
}

async function snapshot(page: Page): Promise<AgentSnapshot> {
  return bridgeCall<AgentSnapshot>(page, "snapshot");
}

async function resetPlayableBaseline(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("reading-shell")).toBeVisible();
  await waitForAgentBridge(page);
  await bridgeCall(page, "resetBaseline");
  await expect(page.getByTestId("session-root")).toHaveAttribute(
    "data-session-state",
    "active.playable",
  );
}

async function submitTextTurn(page: Page, text: string) {
  const input = page.getByTestId("discussion-input-market");
  const submit = page.getByTestId("discussion-ask-market");
  const companionLine = page.getByTestId("agent-turn-companion-line");
  const previousLine =
    (await companionLine.count()) === 1
      ? (await companionLine.textContent())?.trim() ?? null
      : null;
  await expect(input).toBeVisible();
  await input.fill(text);
  await submit.click();
  if (previousLine) {
    // A visible old line is not evidence that this final turn completed.
    await expect(companionLine).not.toHaveText(previousLine, {
      timeout: 15_000,
    });
  }
  await expect(companionLine).toBeVisible({
    timeout: 15_000,
  });
}

async function submitRecordedVoiceTurn(
  page: Page,
  text: string,
  turn_id = "voice-turn-001",
) {
  await bridgeCall(page, "submitFinal", {
    channel: "voice",
    final_text: text,
    turn_id,
  });
  await expect(page.getByTestId("agent-turn-companion-line")).toBeVisible({
    timeout: 15_000,
  });
}

async function expectCommittedMarketAction(
  page: Page,
  before: AgentSnapshot,
) {
  const after = await snapshot(page);
  if (
    !before.metrics ||
    !after.metrics ||
    before.world_revision === null ||
    after.world_revision === null ||
    before.state_hash === null ||
    after.state_hash === null
  ) {
    throw new Error("expected a replayable world basis before and after direct action");
  }
  expect(after.last?.mode).toBe("act");
  expect(after.last?.action).toBe("expand_market");
  expect(after.last?.basis).toEqual(
    expect.objectContaining({
      world_id: before.last?.basis?.world_id ?? expect.any(String),
      graph_revision: before.last?.basis?.graph_revision ?? expect.any(Number),
      ruleset_id: before.last?.basis?.ruleset_id ?? expect.any(String),
    }),
  );
  expect(after.pending_intent).toBeNull();
  expect(after.command_count).toBe(before.command_count + 1);
  expect(after.event_count).toBeGreaterThan(before.event_count);
  expect(after.world_revision).toBe(before.world_revision + 1);
  expect(after.metrics.reachable_orders).not.toBe(
    before.metrics.reachable_orders,
  );
  expect(after.metrics.cash).not.toBe(before.metrics.cash);
  expect(after.state_hash).not.toBe(before.state_hash);
  expect(after.receipt?.committed).toBe(true);
  return after;
}

async function expectShortCompanionLine(page: Page) {
  const line = page.getByTestId("agent-turn-companion-line");
  await expect(line).toBeVisible();
  const text = (await line.innerText()).trim();
  expect(text).not.toBe("");
  expect(text.split(/\n+/).filter(Boolean).length).toBeLessThanOrEqual(2);
  expect(text.length).toBeLessThanOrEqual(80);
  // The partner must not pre-explain the world or write a teacherly summary.
  expect(text).not.toMatch(/影响清单|订单、库存|所以斯密|斯密告诉我们|教师|总结/);
}

async function expectNoActionApprovalUi(page: Page) {
  // These selectors are contract-level negative probes.  They intentionally
  // include hidden DOM: an approval/preview surface must not be mounted at all.
  await expect(
    page.locator(
      [
        '[data-testid*="action-preview"]',
        '[data-testid*="preview"]',
        '[data-testid*="approval"]',
        '[data-testid*="impact-list"]',
        '[data-testid*="execute-confirm"]',
        '[data-testid*="是否执行"]',
      ].join(", "),
    ),
  ).toHaveCount(0);

  const turnSurface = page.getByTestId("agent-turn-surface");
  if ((await turnSurface.count()) > 0) {
    const text = await turnSurface.innerText();
    expect(text).not.toMatch(/审批|动作预览|影响清单|是否执行/);
    expect(text).not.toMatch(/所以斯密|斯密告诉我们|教师式|课本总结/);
  }
}

test.beforeEach(async ({ page }) => {
  await installAgentTurnProviderMock(page);
});

test.describe("T009 / A005 companion action contract", () => {
  test.describe.configure({ timeout: 30_000 });

  test("direct action: partner acknowledges once, then committed world response", async ({
    page,
  }) => {
    await resetPlayableBaseline(page);
    const before = await snapshot(page);

    await submitTextTurn(page, ACTION_TEXT);
    await expectShortCompanionLine(page);
    await expectCommittedMarketAction(page, before);

    await expectNoActionApprovalUi(page);
  });

  test("hypothetical → follow-up: pending intent is discussion-only, then consumed once", async ({
    page,
  }) => {
    await resetPlayableBaseline(page);
    const before = await snapshot(page);

    await submitTextTurn(page, HYPOTHETICAL_TEXT);
    await expectShortCompanionLine(page);
    const pending = await snapshot(page);
    expect(pending.last?.mode).toBe("discuss");
    expect(pending.last?.action).toBeNull();
    expect(pending.pending_intent?.action_id).toBe("expand_market");
    expect(pending.event_count).toBe(before.event_count);
    expect(pending.command_count).toBe(before.command_count);
    expect(pending.world_revision).toBe(before.world_revision);
    expect(pending.metrics).toEqual(before.metrics);
    expect(pending.state_hash).toBe(before.state_hash);

    await submitTextTurn(page, FOLLOW_UP_TEXT);
    await expectShortCompanionLine(page);
    await expectCommittedMarketAction(page, pending);
    await expectNoActionApprovalUi(page);
  });

  test("isolated follow-up: without a unique pending intent it clarifies and does not mutate", async ({
    page,
  }) => {
    await resetPlayableBaseline(page);
    const before = await snapshot(page);

    await submitTextTurn(page, FOLLOW_UP_TEXT);
    await expectShortCompanionLine(page);
    const after = await snapshot(page);
    expect(after.last?.mode).toBe("clarify");
    expect(after.last?.action).toBeNull();
    expect(after.pending_intent).toBeNull();
    expect(after.event_count).toBe(before.event_count);
    expect(after.command_count).toBe(before.command_count);
    expect(after.world_revision).toBe(before.world_revision);
    expect(after.metrics).toEqual(before.metrics);
    expect(after.state_hash).toBe(before.state_hash);
    await expectNoActionApprovalUi(page);
  });

  const invalidations: Array<{ name: string; kind: BasisMutation | "unrelated" }> = [
    { name: "source snapshot changes", kind: "source" },
    { name: "experience changes", kind: "experience" },
    { name: "graph revision changes", kind: "graph" },
    { name: "world revision changes", kind: "world" },
    { name: "ruleset changes", kind: "ruleset" },
    { name: "Stop/reset is received", kind: "stop" },
    { name: "an unrelated new topic arrives", kind: "unrelated" },
  ];

  for (const invalidation of invalidations) {
    test(`pending intent invalidation — ${invalidation.name}`, async ({ page }) => {
      await resetPlayableBaseline(page);
      await submitTextTurn(page, HYPOTHETICAL_TEXT);
      const pending = await snapshot(page);
      expect(pending.pending_intent?.action_id).toBe("expand_market");

      if (invalidation.kind === "unrelated") {
        await submitTextTurn(page, "天气怎么样");
      } else {
        await bridgeCall(page, "mutateBasis", { kind: invalidation.kind });
      }

      const beforeFollowUp = await snapshot(page);
      const clearsImmediately =
        invalidation.kind === "source" ||
        invalidation.kind === "experience" ||
        invalidation.kind === "stop" ||
        invalidation.kind === "unrelated";
      if (clearsImmediately) {
        expect(beforeFollowUp.pending_intent).toBeNull();
      } else {
        // Graph/world/ruleset changes stay in the same experience. The pending
        // is intentionally still observable here; handleAgentTurn must reject
        // it against the freshly inspected basis on the next final turn.
        expect(beforeFollowUp.pending_intent?.action_id).toBe("expand_market");
      }
      if (invalidation.kind === "ruleset") {
        expect(beforeFollowUp.basis_ready).toBe(false);
        expect(beforeFollowUp.basis_error).toBeTruthy();
      }
      await submitTextTurn(page, FOLLOW_UP_TEXT);
      await expectShortCompanionLine(page);
      const after = await snapshot(page);

      expect(after.last?.mode).toBe("clarify");
      expect(after.last?.action).toBeNull();
      expect(after.pending_intent).toBeNull();
      expect(after.event_count).toBe(beforeFollowUp.event_count);
      expect(after.command_count).toBe(beforeFollowUp.command_count);
      expect(after.world_revision).toBe(beforeFollowUp.world_revision);
      expect(after.metrics).toEqual(beforeFollowUp.metrics);
      expect(after.state_hash).toBe(beforeFollowUp.state_hash);
      await expectNoActionApprovalUi(page);
    });
  }

  test("duplicate final / retry: the same final turn returns one receipt and one world mutation", async ({
    page,
  }) => {
    await resetPlayableBaseline(page);
    const before = await snapshot(page);
    const turn_id = "duplicate-final-001";

    await submitRecordedVoiceTurn(page, ACTION_TEXT, turn_id);
    const first = await snapshot(page);
    expect(first.last?.mode).toBe("act");
    expect(first.last?.action).toBe("expand_market");
    expect(first.command_count).toBe(before.command_count + 1);
    expect(first.event_count).toBeGreaterThan(before.event_count);

    await bridgeCall(page, "submitFinal", {
      channel: "voice",
      final_text: ACTION_TEXT,
      turn_id,
    });
    const duplicate = await snapshot(page);
    expect(duplicate.last?.mode).toBe("act");
    expect(duplicate.last?.action).toBe("expand_market");
    expect(duplicate.command_count).toBe(first.command_count);
    expect(duplicate.event_count).toBe(first.event_count);
    expect(duplicate.world_revision).toBe(first.world_revision);
    expect(duplicate.metrics).toEqual(first.metrics);
    expect(duplicate.state_hash).toBe(first.state_hash);
    expect(duplicate.receipt?.duplicate).toBe(true);
    await expectNoActionApprovalUi(page);
  });

  test("text and final voice adapters are semantically equivalent", async ({
    page,
  }) => {
    await resetPlayableBaseline(page);
    await submitTextTurn(page, ACTION_TEXT);
    const textSnapshot = await snapshot(page);
    expect(textSnapshot.last?.mode).toBe("act");
    expect(textSnapshot.last?.action).toBe("expand_market");

    await resetPlayableBaseline(page);
    await submitRecordedVoiceTurn(page, ACTION_TEXT, "voice-equivalence-001");
    const voiceSnapshot = await snapshot(page);
    expect(voiceSnapshot.last?.mode).toBe(textSnapshot.last?.mode);
    expect(voiceSnapshot.last?.action).toBe(textSnapshot.last?.action);
    expect(voiceSnapshot.last?.basis).toEqual(
      expect.objectContaining({
        graph_revision: textSnapshot.last?.basis?.graph_revision,
        world_revision: textSnapshot.last?.basis?.world_revision,
        ruleset_id: textSnapshot.last?.basis?.ruleset_id,
      }),
    );
    expect(voiceSnapshot.command_count).toBe(textSnapshot.command_count);
    expect(voiceSnapshot.event_count).toBe(textSnapshot.event_count);
    expect(voiceSnapshot.world_revision).toBe(textSnapshot.world_revision);
    expect(voiceSnapshot.metrics).toEqual(textSnapshot.metrics);
    expect(voiceSnapshot.state_hash).toBe(textSnapshot.state_hash);
    await expectNoActionApprovalUi(page);
  });
});
