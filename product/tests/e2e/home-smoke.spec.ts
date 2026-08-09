import { expect, test } from "@playwright/test";
import path from "node:path";

test("root enters the canonical full-book chapter reader", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(
    /\/read\/wealth-of-nations\/smith\.b1\.c1$/u,
  );
  await expect(page.getByTestId("chapter-reading-shell")).toBeVisible();
});

test.describe("T002 home smoke · A014", () => {
  test("adapter SourceBlocks, pages 5/19, footnote target, closed world", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(String(err));
    });

    await page.goto("/test-harness");
    await expect(page.getByTestId("reading-shell")).toBeVisible();
    await expect(page.getByText("鲜活阅读器 · 正式入口")).toBeVisible();

    const division = page.getByTestId("source-block-division");
    const market = page.getByTestId("source-block-market");
    await expect(division).toBeVisible();
    await expect(market).toBeVisible();
    await expect(division).toHaveAttribute(
      "data-source-id",
      "smith.b1.c1.division",
    );
    await expect(market).toHaveAttribute(
      "data-source-id",
      "smith.b1.c3.market_extent",
    );
    await expect(division).toHaveAttribute(
      "data-source-locator",
      "Smith_0206-01_235",
    );
    await expect(market).toHaveAttribute(
      "data-source-locator",
      "Smith_0206-01_251",
    );
    await expect(division).toHaveAttribute("data-pdf-page", "36");
    await expect(market).toHaveAttribute("data-pdf-page", "45");
    await expect(division).toHaveAttribute("data-print-page", "5");
    await expect(market).toHaveAttribute("data-print-page", "19");
    await expect(page.getByTestId("source-block-division-pages")).toContainText(
      "OLL p. 5",
    );
    await expect(page.getByTestId("source-block-market-pages")).toContainText(
      "OLL p. 19",
    );

    const fnRef = page.getByTestId(
      "footnote-ref-lf0206-01_footnote_nt114",
    );
    await expect(fnRef).toBeVisible();
    await expect(
      page.getByTestId("footnote-target-lf0206-01_footnote_nt114"),
    ).toContainText("improvements");

    const world = page.getByTestId("world-slot");
    await expect(world).toHaveAttribute("data-state", "closed");
    await expect(world).toBeHidden();

    const shotPath = path.join(
      process.cwd(),
      "test-results",
      "t002-a014-home-1440x900.png",
    );
    await page.screenshot({ path: shotPath, fullPage: false });

    const appErrors = consoleErrors.filter(
      (line) =>
        !line.includes("favicon") &&
        !line.includes("Download the React DevTools"),
    );
    expect(appErrors, `console errors: ${appErrors.join(" | ")}`).toEqual([]);
  });
});
