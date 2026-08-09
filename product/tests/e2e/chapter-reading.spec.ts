import { expect, test, type Page } from "@playwright/test";

const chapterPath = "/read/wealth-of-nations/smith.b1.c1";

async function installAgentTurnMock(page: Page) {
  await page.route("**/api/agent-turn", async (route) => {
    const body = route.request().postDataJSON() as {
      turn?: { active_source_ids?: unknown };
    };
    const rawSourceId = Array.isArray(body.turn?.active_source_ids)
      ? body.turn.active_source_ids[0]
      : null;
    const sourceId =
      typeof rawSourceId === "string" ? rawSourceId : "unknown-source";
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
          companion_line: "这段原文已经接稳，可以继续追问。",
          proposed_action_id: null,
          pending_action_id: null,
          reason_codes: ["test_source_question"],
        },
      }),
    });
  });
}

test.describe("T053 full-book chapter reading", () => {
  test("opens a canonical chapter, exposes Books I–V, and toggles original evidence", async ({
    page,
  }) => {
    await installAgentTurnMock(page);
    await page.goto(chapterPath);

    await expect(page.getByTestId("chapter-reading-shell")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('[data-reading-origin="translation"]').first()).toBeVisible();
    await expect(page.getByText("机译", { exact: true }).first()).toBeVisible();

    const firstSource = page.getByTestId("chapter-source-block-1");
    await expect(firstSource).toHaveAttribute("data-source-id", "smith.b1.c1.p1");
    const firstOriginal = firstSource.locator('[data-reading-origin="original"]');
    await expect(firstOriginal).toBeHidden();

    const legacyExperience = page.getByTestId(
      "source-discussion-division",
    );
    await expect(legacyExperience).toHaveAttribute(
      "data-source-id",
      "smith.b1.c1.division",
    );
    await expect(page.getByTestId("discussion-input-division")).toBeEnabled({
      timeout: 15_000,
    });

    const canonicalExperience = page.getByTestId(
      "source-discussion-smith-b1-c1-p2",
    );
    await expect(canonicalExperience).toHaveAttribute(
      "data-source-id",
      "smith.b1.c1.p2",
    );
    const canonicalInput = page.getByTestId(
      "discussion-input-smith-b1-c1-p2",
    );
    await expect(canonicalInput).toBeEnabled({ timeout: 15_000 });
    const sourceBlockCount = await page
      .locator('[data-testid^="chapter-source-block-"]')
      .count();
    const discussionInputIds = await page
      .locator('textarea[data-testid^="discussion-input-"]')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-testid")),
      );
    expect(discussionInputIds).toHaveLength(sourceBlockCount);
    expect(new Set(discussionInputIds).size).toBe(discussionInputIds.length);

    await canonicalInput.fill("这段原文的关键判断是什么？");
    await page.getByTestId("discussion-ask-smith-b1-c1-p2").click();
    const canonicalZone = page.locator(
      '[data-agent-source-id="smith.b1.c1.p2"]',
    );
    const legacyZone = page.locator(
      '[data-agent-source-id="smith.b1.c1.division"]',
    );
    await expect(canonicalZone).toHaveAttribute("data-agent-active", "true");
    await expect(legacyZone).toHaveAttribute("data-agent-active", "false");
    await expect(canonicalZone.getByTestId("agent-turn-surface")).toBeVisible();
    await expect(page.getByTestId("agent-turn-surface")).toHaveCount(1);
    await expect(canonicalZone.locator("details")).toHaveCount(1);
    await expect(legacyZone.locator("details")).toHaveCount(0);

    await page.getByRole("button", { name: "显示原文对照" }).click();
    await expect(firstOriginal).toBeVisible();
    await expect(firstOriginal.locator('[lang="en"]')).not.toBeEmpty();
    await expect(firstOriginal).toContainText("引用与证据依据");
    await expect(
      firstOriginal.getByTestId("footnote-ref-lf0206-01_footnote_nt114"),
    ).toBeVisible();
    await expect(
      firstOriginal.getByTestId("footnote-target-lf0206-01_footnote_nt114"),
    ).toContainText("improvements");

    await page.getByRole("button", { name: "目录" }).click();
    const toc = page.getByRole("dialog", { name: "全书目录" });
    await expect(toc).toBeVisible();
    for (const roman of ["I", "II", "III", "IV", "V"]) {
      await expect(toc.getByText(`Book ${roman}`, { exact: true })).toBeVisible();
    }
    await toc.getByRole("button", { name: "关闭" }).click();
    await expect(page.getByRole("button", { name: "目录" })).toBeFocused();
    await expect(
      page.getByTestId("chapter-reading-shell").locator("svg"),
    ).toHaveCount(0);
  });

  test("keeps keyboard focus inside the side panel and restores its opener", async ({
    page,
  }) => {
    await page.goto(chapterPath);

    const underlyingReaderAction = page.getByRole("button", {
      name: "显示原文对照",
    });
    const memoryButton = page.getByRole("button", { name: "记忆" });
    await memoryButton.click();

    const memoryPanel = page.getByRole("dialog", { name: "阅读记忆" });
    const memoryCloseButton = memoryPanel.getByRole("button", {
      name: "关闭",
    });
    await expect(memoryPanel).toBeVisible();
    await expect(memoryPanel).toHaveAttribute("aria-modal", "true");
    await expect(memoryPanel.getByRole("button")).toHaveCount(1);
    await expect(memoryCloseButton).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(memoryCloseButton).toBeFocused();
    await expect(underlyingReaderAction).not.toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(memoryCloseButton).toBeFocused();
    await expect(underlyingReaderAction).not.toBeFocused();

    await page.keyboard.press("Escape");
    await expect(memoryPanel).toBeHidden();
    await expect(memoryButton).toBeFocused();

    const tocButton = page.getByRole("button", { name: "目录" });
    await tocButton.click();

    const tocPanel = page.getByRole("dialog", { name: "全书目录" });
    const tocCloseButton = tocPanel.getByRole("button", { name: "关闭" });
    const lastChapterLink = tocPanel.getByRole("link").last();
    await expect(tocPanel).toBeVisible();

    await lastChapterLink.focus();
    await page.keyboard.press("Tab");
    await expect(tocCloseButton).toBeFocused();
    await expect(underlyingReaderAction).not.toBeFocused();

    await tocCloseButton.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(lastChapterLink).toBeFocused();
    await expect(underlyingReaderAction).not.toBeFocused();

    await page.keyboard.press("Escape");
    await expect(tocPanel).toBeHidden();
    await expect(tocButton).toBeFocused();
  });

  test("fails closed for an unknown book or chapter", async ({ page }) => {
    const unknownChapter = await page.goto(
      "/read/wealth-of-nations/smith.b9.c99",
    );
    expect(unknownChapter?.status()).toBe(404);
    await expect(page.getByTestId("chapter-reading-shell")).toHaveCount(0);

    const unknownBook = await page.goto("/read/not-a-book/smith.b1.c1");
    expect(unknownBook?.status()).toBe(404);
    await expect(page.getByTestId("chapter-reading-shell")).toHaveCount(0);
  });

  test("keeps the Chinese body first at 360px with keyboard and reduced-motion equivalence", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(chapterPath);

    const translation = page.locator('[data-reading-origin="translation"]').first();
    await expect(translation).toBeVisible();
    const box = await translation.boundingBox();
    expect(box?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(800);

    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(overflow.page).toBeLessThanOrEqual(overflow.viewport);

    const compare = page.getByRole("button", { name: "显示原文对照" });
    await compare.focus();
    await compare.press("Enter");
    await expect(
      page
        .getByTestId("chapter-source-block-1")
        .locator('[data-reading-origin="original"]'),
    ).toBeVisible();
  });
});
