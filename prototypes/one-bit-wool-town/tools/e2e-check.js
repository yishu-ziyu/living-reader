/* Self-check: load the prototype, switch places, click actions, capture states. */
const { chromium } = require("/opt/homebrew/lib/node_modules/playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("http://127.0.0.1:7110/", { waitUntil: "load" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "tools/check-construction.png" });

  await page.waitForTimeout(2500); // construction done, sim live

  // Place topology focus checks
  await page.click("#nodeMarket");
  await page.waitForTimeout(300);
  const focusMarket = await page.textContent("#focusTitle");
  const sceneFocusMarket = await page.getAttribute("#scene", "data-focus");
  await page.screenshot({ path: "tools/check-focus-market.png" });

  await page.click("#nodeStorehouse");
  await page.waitForTimeout(300);
  const focusStore = await page.textContent("#focusTitle");
  const sceneFocusStore = await page.getAttribute("#scene", "data-focus");
  await page.screenshot({ path: "tools/check-focus-storehouse.png" });

  await page.click("#nodeWorkshop");
  await page.waitForTimeout(300);
  const focusWorkshop = await page.textContent("#focusTitle");

  await page.click("#nodeRoad");
  await page.waitForTimeout(200);
  const focusAfterRoad = await page.textContent("#focusTitle");
  const roadLog = await page.locator("#eventLog li").last().textContent();
  await page.click("#btnExpand");
  await page.waitForTimeout(1600);
  await page.click("#btnRush");
  await page.waitForTimeout(2600);
  await page.screenshot({ path: "tools/check-actions.png" });

  // narrow viewport no page-level overflow
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const overflowX = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  });
  await page.screenshot({ path: "tools/check-narrow.png" });

  const rev = await page.textContent("#revReadout");
  const status = await page.textContent("#systemStatus");
  const cash = await page.textContent("#numCash");
  const orders = await page.textContent("#numOrders");
  const summary = await page.textContent("#domSummary");

  console.log(
    JSON.stringify(
      {
        rev,
        status,
        cash,
        orders,
        focusMarket,
        sceneFocusMarket,
        focusStore,
        sceneFocusStore,
        focusWorkshop,
        focusAfterRoad,
        overflowX,
        summaryHasPlaces: summary.includes("地点：村落市集"),
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
})();
