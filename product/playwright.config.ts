import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PW_PORT ?? 3000);
const baseURL = `http://127.0.0.1:${port}`;

/**
 * Dev server so public test bridge flags are available to the client bundle.
 * NEXT_DIST_DIR isolates Playwright from an already-running product dev server.
 *
 * Production start remains `pnpm build && pnpm start` with the default `.next`.
 */
const webServerCommand =
  `NEXT_DIST_DIR=.next-playwright NEXT_PUBLIC_T003_BRIDGE=1 NEXT_PUBLIC_T004_SESSION_BRIDGE=1 NEXT_PUBLIC_T009_AGENT_TURN_BRIDGE=1 pnpm dev --hostname 127.0.0.1 --port ${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: process.env.PW_REUSE_SERVER === "1",
    timeout: 180_000,
  },
});
