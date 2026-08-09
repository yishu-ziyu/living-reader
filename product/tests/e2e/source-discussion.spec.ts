/**
 * T006 A002: source discussion → BookThought, zero world mutation.
 */
import { expect, test, type Page } from "@playwright/test";

type AgentTurnRouteRequest = {
  turn?: {
    active_source_ids?: unknown;
    final_text?: unknown;
  };
};

async function installAgentTurnMock(page: Page) {
  await page.route("**/api/agent-turn", async (route) => {
    const body = route.request().postDataJSON() as AgentTurnRouteRequest;
    const rawSourceId = Array.isArray(body.turn?.active_source_ids)
      ? body.turn.active_source_ids[0]
      : "";
    const sourceId =
      typeof rawSourceId === "string" ? rawSourceId : "unknown-source";
    const market = sourceId === "smith.b1.c3.market_extent";
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        candidate: {
          mode: "discuss",
          intent_class: "source_question",
          relevance: "directly_anchored",
          confidence: "high",
          target_source_ids: [sourceId],
          evidence_refs: [],
          open_question: null,
          companion_line: market
            ? "会。市场范围会限制分工能分得多细。"
            : "会。分工会让同一操作练得更熟。",
          proposed_action_id: null,
          pending_action_id: null,
          reason_codes: ["test_source_question"],
        },
      }),
    });
  });
}

test.describe("T006 Source discussion", () => {
  test("A002: ask, reject, save, revise; zero world; evidence bound", async ({
    page,
  }) => {
    await installAgentTurnMock(page);
    await page.goto("/test-harness");
    await expect(page.getByTestId("reading-shell")).toBeVisible();
    await expect(page.getByTestId("world-slot")).toHaveAttribute(
      "data-state",
      "closed",
    );
    await expect(page.getByTestId("world-slot")).toBeHidden();
    await expect(page.getByTestId("thought-list-empty")).toBeVisible();
    await expect(page.getByTestId("idea-list-empty")).toBeVisible();

    // Ask division question
    await page
      .getByTestId("discussion-input-division")
      .fill("分工会让人更熟练吗？");
    await page.getByTestId("discussion-ask-division").click();
    await expect(page.getByTestId("companion-answer-card")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("companion-answer-zh")).not.toBeEmpty();
    await expect(page.getByTestId("companion-quote-panel")).toContainText(
      "division of labour",
    );
    await expect(page.getByTestId("companion-source-meta")).toContainText(
      "Smith_0206-01_235",
    );
    await expect(page.getByTestId("companion-source-meta")).toContainText(
      "PDF36",
    );
    await expect(page.getByTestId("companion-evidence")).toContainText("pdf:36");

    // Still no thoughts / world open
    await expect(page.getByTestId("thought-list-empty")).toBeVisible();
    await expect(page.getByTestId("world-slot")).toHaveAttribute(
      "data-state",
      "closed",
    );

    // Reject → zero BookThought
    await page.getByTestId("companion-reject").click();
    await expect(page.getByTestId("companion-empty")).toBeVisible();
    await expect(page.getByTestId("thought-list-empty")).toBeVisible();

    // Ask again and save
    await page
      .getByTestId("discussion-input-division")
      .fill("分工会让人更熟练吗？");
    await page.getByTestId("discussion-ask-division").click();
    await expect(page.getByTestId("companion-answer-card")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("companion-save").click();
    await expect(page.getByTestId("thought-list")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-testid^='thought-card-']").first()).toBeVisible();
    await expect(
      page.locator("[data-testid^='thought-evidence-']").first(),
    ).toContainText("Smith_0206-01_235");

    // Ideas still empty (BookThought ≠ ReaderIdea)
    await expect(page.getByTestId("idea-list-empty")).toBeVisible();

    // Revise thought
    await page.locator("[data-testid^='thought-edit-']").first().click();
    await page
      .locator("[data-testid^='thought-edit-input-']")
      .first()
      .fill("修订后的 Agent 思考文本。");
    await page.locator("[data-testid^='thought-edit-save-']").first().click();
    await expect(page.getByTestId("thought-history")).toBeVisible({
      timeout: 10_000,
    });

    // World still closed
    await expect(page.getByTestId("world-slot")).toHaveAttribute(
      "data-state",
      "closed",
    );
    await expect(page.getByTestId("world-slot")).toBeHidden();

    // Reload recovers saved thoughts, not rejected candidates
    await page.reload();
    await expect(page.getByTestId("thought-list")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("companion-empty")).toBeVisible();
    await expect(page.getByTestId("world-slot")).toHaveAttribute(
      "data-state",
      "closed",
    );
  });

  test("draft isolation: edit A, reject, ask B, save only B", async ({
    page,
  }) => {
    await installAgentTurnMock(page);
    await page.goto("/test-harness");
    await expect(page.getByTestId("reading-shell")).toBeVisible();

    // Candidate A
    await page
      .getByTestId("discussion-input-division")
      .fill("分工会让人更熟练吗？");
    await page.getByTestId("discussion-ask-division").click();
    await expect(page.getByTestId("companion-answer-card")).toBeVisible({
      timeout: 15_000,
    });
    const markerA = "DRAFT_A_ABANDONED_MARKER_NEVER_SAVE";
    await page.getByTestId("companion-inference-edit").fill(markerA);
    await page.getByTestId("companion-reject").click();
    await expect(page.getByTestId("companion-empty")).toBeVisible();

    // Candidate B (market)
    await page
      .getByTestId("discussion-input-market")
      .fill("市场范围如何限制分工？");
    await page.getByTestId("discussion-ask-market").click();
    await expect(page.getByTestId("companion-answer-card")).toBeVisible({
      timeout: 15_000,
    });
    // Draft must NOT still show A's abandoned text
    await expect(page.getByTestId("companion-inference-edit")).not.toHaveValue(
      markerA,
    );
    await expect(page.getByTestId("companion-source-meta")).toContainText(
      "Smith_0206-01_251",
    );
    await page.getByTestId("companion-save").click();
    await expect(page.getByTestId("thought-list")).toBeVisible({
      timeout: 15_000,
    });
    const body = await page.getByTestId("thought-list").innerText();
    expect(body).not.toContain(markerA);
    await expect(
      page.locator("[data-testid^='thought-evidence-']").first(),
    ).toContainText("Smith_0206-01_251");

    await page.reload();
    await expect(page.getByTestId("thought-list")).toBeVisible({
      timeout: 15_000,
    });
    const after = await page.getByTestId("thought-list").innerText();
    expect(after).not.toContain(markerA);
    await expect(
      page.locator("[data-testid^='thought-evidence-']").first(),
    ).toContainText("pdf:45");
  });

  test("Stop fences an in-flight semantic final before it can update the UI", async ({
    page,
  }) => {
    let requestCount = 0;
    let releaseResponse: () => void = () => {};
    let markRequestStarted: () => void = () => {};
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const requestStarted = new Promise<void>((resolve) => {
      markRequestStarted = resolve;
    });
    await page.route("**/api/agent-turn", async (route) => {
      requestCount += 1;
      markRequestStarted();
      await responseGate;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          candidate: {
            mode: "discuss",
            intent_class: "source_question",
            relevance: "directly_anchored",
            confidence: "high",
            target_source_ids: ["smith.b1.c1.division"],
            evidence_refs: [],
            open_question: null,
            companion_line: "这句不该在停止后出现。",
            proposed_action_id: null,
            pending_action_id: null,
            reason_codes: ["test_delayed_final"],
          },
        }),
      });
    });

    await page.goto("/test-harness");
    await page
      .getByTestId("discussion-input-division")
      .fill("分工会让人更熟练吗？");
    await page.getByTestId("discussion-ask-division").click();
    await requestStarted;

    await page.getByTestId("discussion-stop-division").click();
    releaseResponse();

    await expect(page.getByTestId("session-state-division")).toHaveAttribute(
      "data-session-state",
      "paused",
    );
    await expect(page.getByTestId("companion-empty")).toBeVisible();
    await expect(page.getByTestId("agent-turn-surface")).toHaveCount(0);
    expect(requestCount).toBe(1);
  });
});
