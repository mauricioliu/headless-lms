import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@headless-lms\/core\/shared\/([a-z-]+)$/,
        replacement: r("./packages/core/src/shared/$1.ts"),
      },
      {
        find: /^@headless-lms\/core\/reporting\/([a-z-]+)$/,
        replacement: r("./packages/core/src/reporting/$1/index.ts"),
      },
      {
        find: /^@headless-lms\/core\/([a-z-]+)$/,
        replacement: r("./packages/core/src/$1/index.ts"),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["**/src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
