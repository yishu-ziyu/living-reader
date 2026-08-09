/**
 * T005 A003 / A021–A023 Playwright: Idea + Relation review chain.
 */
import { expect, test } from "@playwright/test";

test.describe("T005 Relation review", () => {
  test("A021–A023: submit, revise, fixture, reject, repropose, accept, stale", async ({
    page,
  }) => {
    await page.goto("/test-harness");
    await expect(page.getByTestId("reading-shell")).toBeVisible();
    await expect(page.getByTestId("world-slot")).toHaveAttribute(
      "data-state",
      "closed",
    );
    await expect(page.getByTestId("world-slot")).toBeHidden();
    await expect(page.getByTestId("idea-list-empty")).toBeVisible();

    // A021: division Idea + F33 SourceBlock evidence on card
    await page.getByTestId("idea-input-division").fill("分工提高生产率。");
    await page.getByTestId("idea-submit-division").click();
    await expect(page.getByTestId("idea-list")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-testid^='idea-card-']").first()).toBeVisible();
    const divEvidence = page.locator("[data-testid^='idea-evidence-']").first();
    await expect(divEvidence).toContainText("Smith_0206-01_235");
    await expect(divEvidence).toContainText("pdf:36");
    await expect(divEvidence).toContainText("print:5");

    // Edit → revision
    const editBtn = page.locator("[data-testid^='idea-edit-']").first();
    await editBtn.click();
    const editInput = page.locator("[data-testid^='idea-edit-input-']").first();
    await editInput.fill("分工提高生产率（修订）。");
    await page.locator("[data-testid^='idea-edit-save-']").first().click();
    await expect(page.getByTestId("idea-history")).toBeVisible({
      timeout: 10_000,
    });

    // Market replay fixture (非语音) + F33 market evidence
    await page.getByTestId("market-replay-fixture").click();
    await expect(page.getByTestId("relation-card")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("idea-evidence-idea_market_fixture")).toContainText(
      "Smith_0206-01_251",
    );
    await expect(page.getByTestId("idea-evidence-idea_market_fixture")).toContainText(
      "pdf:45",
    );
    await expect(page.getByTestId("idea-evidence-idea_market_fixture")).toContainText(
      "print:19",
    );
    await expect(page.getByTestId("relation-card")).toHaveAttribute(
      "data-review-status",
      "proposed",
    );

    // A003 path: revise → reject → repropose → accept
    await page.getByTestId("relation-corrections-input").fill("措辞微调");
    await page.getByTestId("relation-revise").click();
    await expect(page.getByTestId("relation-card")).toHaveAttribute(
      "data-review-status",
      "proposed",
      { timeout: 10_000 },
    );

    await page.getByTestId("relation-reject").click();
    await expect(page.getByTestId("relation-card")).toHaveAttribute(
      "data-review-status",
      "rejected",
      { timeout: 10_000 },
    );
    await expect(page.getByTestId("world-slot")).toHaveAttribute(
      "data-state",
      "closed",
    );

    await page.getByTestId("relation-repropose").click();
    await expect(page.getByTestId("relation-card")).toHaveAttribute(
      "data-review-status",
      "proposed",
      { timeout: 10_000 },
    );

    await page.getByTestId("relation-accept").click();
    await expect(page.getByTestId("relation-card")).toHaveAttribute(
      "data-review-status",
      "accepted",
      { timeout: 10_000 },
    );
    // T005 does not open world
    await expect(page.getByTestId("world-slot")).toHaveAttribute(
      "data-state",
      "closed",
    );
    await expect(page.getByTestId("world-slot")).toBeHidden();

    // A023: revise idea → stale
    await page.locator("[data-testid^='idea-edit-']").first().click();
    await page
      .locator("[data-testid^='idea-edit-input-']")
      .first()
      .fill("又一次修订使关系过期。");
    await page.locator("[data-testid^='idea-edit-save-']").first().click();
    await expect(page.getByTestId("relation-card")).toHaveAttribute(
      "data-stale",
      "true",
      { timeout: 10_000 },
    );
    await expect(page.getByTestId("world-slot")).toHaveAttribute(
      "data-state",
      "closed",
    );
    await expect(page.getByTestId("session-root")).toHaveAttribute(
      "data-session-state",
      "active.reading",
    );

    // Reload recovers projection + F33 evidence survives
    await page.reload();
    await expect(page.getByTestId("idea-list")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("relation-card")).toBeVisible();
    await expect(page.locator("[data-testid^='idea-evidence-']").first()).toContainText(
      "Smith_0206-01_235",
    );
    await expect(page.getByTestId("idea-evidence-idea_market_fixture")).toContainText(
      "Smith_0206-01_251",
    );
  });
});
