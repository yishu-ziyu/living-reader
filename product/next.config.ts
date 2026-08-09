import type { NextConfig } from "next";

/**
 * When any public bridge flag is "1" (Playwright webServer), alias
 * bridge-hosts → dev implementation that mounts TestBridges.
 * Production `pnpm build` without flags → prod stubs with zero TestBridge imports.
 *
 * Alias values are project-relative (required by Turbopack).
 */
const bridgesEnabled =
  process.env.NODE_ENV !== "production" &&
  (process.env.NEXT_PUBLIC_T003_BRIDGE === "1" ||
    process.env.NEXT_PUBLIC_T004_SESSION_BRIDGE === "1" ||
    process.env.NEXT_PUBLIC_T009_AGENT_TURN_BRIDGE === "1");

const bridgeHostsTarget = bridgesEnabled
  ? "./src/components/bridge-hosts.dev.tsx"
  : "./src/components/bridge-hosts.prod.tsx";

const nextConfig: NextConfig = {
  // Playwright uses an isolated directory so E2E can run while the user's
  // ordinary `.next` dev server remains open.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  turbopack: {
    resolveAlias: {
      "@/components/bridge-hosts": bridgeHostsTarget,
    },
  },
  webpack: (config) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@/components/bridge-hosts": path.resolve(__dirname, bridgeHostsTarget),
    };
    return config;
  },
};

export default nextConfig;
