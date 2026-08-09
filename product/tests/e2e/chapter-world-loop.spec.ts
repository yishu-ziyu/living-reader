import { expect, test, type Page } from "@playwright/test";

const CHAPTER_ONE = "/read/wealth-of-nations/smith.b1.c1";
const INVITATION_QUESTION = "市场扩大后，分工会怎样变化？";
const ACTION_REQUEST = "再扩大市场，把货卖得更远。";

type AgentTurnRequest = {
  turn?: {
    final_text?: unknown;
    active_source_ids?: unknown;
    invitation_basis?: unknown;
    invited_question_keys?: unknown;
    relationship_context?: {
      active_recipe_ids?: unknown;
    };
    world_basis?: unknown;
  };
};

type ObservedTurn = {
  finalText: string;
  invitationReady: boolean;
  worldReady: boolean;
  activeRecipeIds: string[];
  invitedQuestionKeys: string[];
};

async function installSemanticProviderFixture(
  page: Page,
  observed: ObservedTurn[],
): Promise<void> {
  await page.route("**/api/agent-turn", async (route) => {
    const body = route.request().postDataJSON() as AgentTurnRequest;
    const turn = body.turn ?? {};
    const finalText = typeof turn.final_text === "string" ? turn.final_text : "";
    const sourceId =
      Array.isArray(turn.active_source_ids) &&
      typeof turn.active_source_ids[0] === "string"
        ? turn.active_source_ids[0]
        : "smith.b1.c3.market_extent";
    observed.push({
      finalText,
      invitationReady: turn.invitation_basis !== null && turn.invitation_basis !== undefined,
      worldReady: turn.world_basis !== null && turn.world_basis !== undefined,
      activeRecipeIds: Array.isArray(
        turn.relationship_context?.active_recipe_ids,
      )
        ? turn.relationship_context.active_recipe_ids.filter(
            (recipeId): recipeId is string => typeof recipeId === "string",
          )
        : [],
      invitedQuestionKeys: Array.isArray(turn.invited_question_keys)
        ? turn.invited_question_keys.filter(
            (key): key is string => typeof key === "string",
          )
        : [],
    });

    const candidate =
      finalText === ACTION_REQUEST
        ? {
            mode: "act",
            intent_class: "executable_action",
            relevance: "mechanism_adjacent",
            confidence: "high",
            target_source_ids: [sourceId],
            evidence_refs: [],
            open_question: null,
            companion_line: "好，再把市场往外推一层。",
            proposed_action_id: "expand_market",
            pending_action_id: null,
            recipe_id: null,
            trigger_question: null,
            reason: null,
            reason_codes: ["clear_allowlisted_action"],
          }
        : {
            mode: "invite_world",
            intent_class: "source_question",
            relevance: "mechanism_adjacent",
            confidence: "high",
            target_source_ids: [sourceId],
            evidence_refs: [],
            open_question: null,
            companion_line: "这条关系放进世界里比较，会看得更清楚。",
            proposed_action_id: null,
            pending_action_id: null,
            recipe_id: "smith.b1.market-extent.v1",
            trigger_question: INVITATION_QUESTION,
            reason: "这个问题需要比较市场扩大前后的订单与材料流。",
            reason_codes: ["world_explains_mechanism"],
          };

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, candidate }),
    });
  });
}

async function openIdeaComposer(page: Page, sourceId: string): Promise<void> {
  const zone = page.locator(`[data-agent-source-id="${sourceId}"]`);
  const details = zone.locator("details");
  if ((await details.count()) === 0) {
    await zone.locator('[data-testid^="discussion-continue-"]').click();
    await expect(details).toHaveCount(1);
  }
  if (!(await details.getAttribute("open"))) {
    await details.locator(":scope > summary").click();
  }
}
async function submitIdea(
  page: Page,
  topic: "division" | "market",
  text: string,
): Promise<void> {
  await page.getByTestId(`idea-input-${topic}`).fill(text);
  const submit = page.getByTestId(`idea-submit-${topic}`);
  await expect(submit).toBeEnabled({ timeout: 10_000 });
  await submit.click();
  await expect(page.getByTestId(`idea-input-${topic}`)).toHaveValue("");
}

async function metricValues(page: Page): Promise<Record<string, number>> {
  return page.locator('[data-testid^="world-metric-"]').evaluateAll((nodes) =>
    Object.fromEntries(
      nodes.map((node) => [
        node.getAttribute("data-metric-key"),
        Number(node.getAttribute("data-metric-value")),
      ]),
    ),
  );
}

test("reader-approved relation opens and advances a deterministic world without a test bridge", async ({
  page,
}) => {
  const observedTurns: ObservedTurn[] = [];
  await installSemanticProviderFixture(page, observedTurns);

  await page.goto(CHAPTER_ONE);
  await expect(page.getByTestId("chapter-reading-shell")).toBeVisible();
  await expect(page.locator('[data-reading-origin="translation"]').first()).toBeVisible();
  await openIdeaComposer(page, "smith.b1.c1.division");
  await submitIdea(
    page,
    "division",
    "分工提高熟练度，但它可能依赖足够大的市场。",
  );

  await page.getByRole("button", { name: "目录" }).click();
  await page
    .locator('a[href="/read/wealth-of-nations/smith.b1.c3"]')
    .click();
  await expect(page).toHaveURL(/\/read\/wealth-of-nations\/smith\.b1\.c3$/u);
  await openIdeaComposer(page, "smith.b1.c3.market_extent");
  await submitIdea(page, "market", "市场越大，专业分工越能持续扩大。");

  const relation = page.getByTestId("relation-card");
  await expect(relation).toHaveAttribute("data-review-status", "proposed", {
    timeout: 10_000,
  });
  await page.getByTestId("relation-accept").click();
  await expect(relation).toHaveAttribute("data-review-status", "accepted", {
    timeout: 10_000,
  });

  const discussion = page.getByTestId("discussion-input-market");
  await discussion.fill(INVITATION_QUESTION);
  await page.getByTestId("discussion-ask-market").click();
  const invitation = page.getByTestId("world-invitation");
  await expect(invitation).toBeVisible({ timeout: 15_000 });
  await expect(invitation.locator('[aria-live="polite"]')).toContainText(
    INVITATION_QUESTION,
  );
  await expect(invitation.locator('[aria-live="polite"]')).toHaveAttribute(
    "aria-atomic",
    "true",
  );
  await expect(invitation).toContainText(INVITATION_QUESTION);
  await page.getByTestId("world-invitation-accept").click();
  await expect(page.getByTestId("world-construction-stage")).toBeVisible({
    timeout: 15_000,
  });

  const world = page.getByTestId("world-action-surface");
  await expect(world).toHaveAttribute("data-state", "open", { timeout: 15_000 });
  await expect(world).toHaveAttribute("data-world-revision", "0");
  await expect(page.getByTestId("world-action-surface")).toHaveCount(1);
  await page.getByTestId("evidence-toggle").click();
  await expect(page.getByTestId("evidence-block")).toHaveCount(1);
  await expect(
    page.locator('[data-testid^="evidence-relation-"]'),
  ).toHaveCount(1);
  await expect.poll(() => metricValues(page)).toEqual({
    supply: 12,
    inventory: 8,
    demand: 2,
    cash: 24,
  });

  await page.getByTestId("world-action-expand_market").click();
  await expect(world).toHaveAttribute("data-world-revision", "1", {
    timeout: 10_000,
  });
  await expect.poll(() => metricValues(page)).toEqual({
    supply: 17,
    inventory: 11,
    demand: 4,
    cash: 28,
  });
  await expect(page.getByTestId("world-event-feed")).toContainText(
    "merchant:ship:ORDERS_REACHABLE",
  );

  await discussion.fill(ACTION_REQUEST);
  await page.getByTestId("discussion-ask-market").click();
  await expect(page.getByTestId("agent-turn-companion-line")).toHaveText(
    "好，再把市场往外推一层。",
    { timeout: 15_000 },
  );
  await expect(world).toHaveAttribute("data-world-revision", "2");
  await expect.poll(() => metricValues(page)).toEqual({
    supply: 22,
    inventory: 14,
    demand: 6,
    cash: 32,
  });

  await expect(
    page.getByTestId("evidence-block").getByRole("heading", {
      name: "原文",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByTestId("evidence-return-source").click();
  await expect(page.getByTestId("chapter-source-block-1")).toBeFocused();

  await page.getByTestId("world-collapse").click();
  await expect(page.getByTestId("world-reopen")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("world-reopen")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId("world-reopen").click();
  const restoredWorld = page.getByTestId("world-action-surface");
  await expect(restoredWorld).toHaveAttribute("data-world-revision", "2");
  await expect.poll(() => metricValues(page)).toEqual({
    supply: 22,
    inventory: 14,
    demand: 6,
    cash: 32,
  });
  await expect(restoredWorld).toHaveCount(1);

  const restoredDiscussion = page.getByTestId("discussion-input-market");
  await restoredDiscussion.fill(INVITATION_QUESTION);
  await page.getByTestId("discussion-ask-market").click();
  await expect(page.getByTestId("world-invitation")).toHaveCount(0);
  await expect(page.getByTestId("agent-turn-companion-line")).toContainText(
    "已经邀请过",
  );

  expect(observedTurns).toHaveLength(3);
  expect(observedTurns[0]).toMatchObject({
    finalText: INVITATION_QUESTION,
    invitationReady: true,
    worldReady: false,
    invitedQuestionKeys: [],
    activeRecipeIds: ["smith.b1.market-extent.v1"],
  });
  expect(observedTurns[1]).toMatchObject({
    finalText: ACTION_REQUEST,
    invitationReady: true,
    worldReady: true,
  });
  expect(observedTurns[2]).toMatchObject({
    finalText: INVITATION_QUESTION,
    invitationReady: true,
    worldReady: true,
  });
  expect(observedTurns[2]?.invitedQuestionKeys).toHaveLength(1);
});
