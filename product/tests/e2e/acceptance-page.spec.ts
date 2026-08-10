import { pathToFileURL } from "node:url";
import path from "node:path";
import { expect, test } from "@playwright/test";

const PAGE_URL = pathToFileURL(
  path.join(process.cwd(), "docs/acceptance/T071/index.html"),
).href;

test.describe("T071 acceptance page", () => {
  test("renders four gates with their screenshots loaded", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto(PAGE_URL);

    await expect(page.locator("[data-gate]")).toHaveCount(4);

    const broken = await page.evaluate(() =>
      [...document.images]
        .filter((image) => image.naturalWidth === 0)
        .map((image) => image.getAttribute("src")),
    );
    expect(broken).toEqual([]);

    await expect(page.locator("#tally")).toHaveText("未判 4 · 过 0 · 不过 0");
    expect(errors).toEqual([]);
  });

  test("records one verdict per gate and allows undo", async ({ page }) => {
    await page.goto(PAGE_URL);

    const gate = page.locator('[data-gate="2"]');
    const pass = gate.locator("button[data-v=pass]");
    const fail = gate.locator("button[data-v=fail]");

    await page.locator('[data-gate="1"] button[data-v=pass]').click();
    await fail.click();
    await expect(page.locator("#tally")).toHaveText("未判 2 · 过 1 · 不过 1");

    await pass.click();
    await expect(fail).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#tally")).toHaveText("未判 2 · 过 2 · 不过 0");

    await pass.click();
    await expect(pass).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#tally")).toHaveText("未判 3 · 过 1 · 不过 0");
  });

  test("summarises every gate verdict for copying back", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(PAGE_URL);

    for (const gate of ["1", "2", "3"]) {
      await page.locator(`[data-gate="${gate}"] button[data-v=pass]`).click();
    }
    await page.locator('[data-gate="4"] button[data-v=fail]').click();
    await page.locator('[data-gate="4"] .note').fill("锁标不够明显");

    await page.locator("#copy").click();
    await expect(page.locator("#out")).toHaveText("已复制，粘回对话即可。");

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("门4 锁住的路挡得住：不过 — 锁标不够明显");
    expect(copied).toContain("有不过 → 先修，不要动文档");
    expect(copied).not.toContain("未判");
  });
});
