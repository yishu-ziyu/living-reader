/* Self-check: load the prototype, click both actions, capture states. */
const { chromium } = require("/opt/homebrew/lib/node_modules/playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("http://127.0.0.1:7100/", { waitUntil: "load" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "tools/check-construction.png" });

  await page.waitForTimeout(2500); // construction done, sim live
  await page.click("#btnExpand");
  await page.waitForTimeout(1600);
  await page.click("#btnRush");
  await page.waitForTimeout(2600);
  await page.screenshot({ path: "tools/check-actions.png" });

  const rev = await page.textContent("#revReadout");
  const status = await page.textContent("#systemStatus");
  const cash = await page.textContent("#numCash");
  const orders = await page.textContent("#numOrders");
  console.log(JSON.stringify({ rev, status, cash, orders, errors }, null, 2));
  await browser.close();
})();
