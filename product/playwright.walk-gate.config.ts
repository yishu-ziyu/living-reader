/**
 * Temporary T072 gate config: reuses the bridge dev server on 7130 so the
 * developer's own server on 3000 is left alone. Delete after the gate review.
 */
import { defineConfig, devices } from "@playwright/test";

const port = 7130;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
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
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command:
      "NEXT_DIST_DIR=.next-walk-gate NEXT_PUBLIC_T003_BRIDGE=1 NEXT_PUBLIC_T004_SESSION_BRIDGE=1 NEXT_PUBLIC_T009_AGENT_TURN_BRIDGE=1 pnpm dev --hostname 127.0.0.1 --port 7130",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
