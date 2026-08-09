/**
 * T006 A002: source discussion → BookThought, zero world mutation.
 */
import { expect, test } from "@playwright/test";

test.describe("T006 Source discussion", () => {
  test("A002: ask, reject, save, revise; zero world; evidence bound", async ({
    page,
  }) => {
    await page.goto("/");
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
    await page.goto("/");
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
});
