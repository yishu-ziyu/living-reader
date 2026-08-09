import { expect, test } from "@playwright/test";

const chapterPath = "/read/wealth-of-nations/smith.b1.c1";

test.describe("T053 full-book chapter reading", () => {
  test("opens a canonical chapter, exposes Books I–V, and toggles original evidence", async ({
    page,
  }) => {
    await page.goto(chapterPath);

    await expect(page.getByTestId("chapter-reading-shell")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('[data-reading-origin="translation"]').first()).toBeVisible();
    await expect(page.getByText("机译", { exact: true }).first()).toBeVisible();

    const firstSource = page.getByTestId("chapter-source-block-1");
    await expect(firstSource).toHaveAttribute("data-source-id", "smith.b1.c1.p1");
    const firstOriginal = firstSource.locator('[data-reading-origin="original"]');
    await expect(firstOriginal).toBeHidden();

    await page.getByRole("button", { name: "显示原文对照" }).click();
    await expect(firstOriginal).toBeVisible();
    await expect(firstOriginal.locator('[lang="en"]')).not.toBeEmpty();
    await expect(firstOriginal).toContainText("引用与证据依据");

    await page.getByRole("button", { name: "目录" }).click();
    const toc = page.getByRole("dialog", { name: "全书目录" });
    await expect(toc).toBeVisible();
    for (const roman of ["I", "II", "III", "IV", "V"]) {
      await expect(toc.getByText(`Book ${roman}`, { exact: true })).toBeVisible();
    }
    await toc.getByRole("button", { name: "关闭" }).click();
    await expect(page.getByRole("button", { name: "目录" })).toBeFocused();
    await expect(page.locator("svg")).toHaveCount(0);
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
