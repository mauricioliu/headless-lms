import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Standalone config for `pnpm --filter admin test`. The root
// vitest.workspace.ts also extends this file for the monorepo-wide run, adding
// the `@/*` alias there — it cannot live here alone because `@/` must resolve
// relative to this app's src only when tests run from the repo root too. It is
// duplicated in the workspace project on purpose: the alias is identical.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: r("./src/$1") }],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
