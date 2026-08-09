import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Next.js 16 ESLint CLI flat config.
 * Replaces deprecated `next lint` + FlatCompat extends.
 * @see https://nextjs.org/docs/app/api-reference/config/eslint
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".next-playwright/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "coverage/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
