// Three projects: the root config's suite (packages, plugins, adapters, and
// the two API/website apps), plus the student and admin apps — each imports
// through its own `@/*` alias, so each needs a project-local alias to resolve
// under vitest. One global `@/` alias would collide with the other app's.
import { fileURLToPath } from "node:url";
import { defineWorkspace } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "main",
      include: ["**/src/**/*.test.{ts,tsx}"],
      exclude: ["**/node_modules/**", "**/dist/**", "apps/student/**", "apps/admin/**"],
    },
  },
  {
    extends: "./apps/student/vitest.config.ts",
    test: {
      name: "student",
      include: [r("./apps/student/src/**/*.test.{ts,tsx}")],
    },
    resolve: {
      alias: [{ find: /^@\/(.*)$/, replacement: r("./apps/student/src/$1") }],
    },
  },
  {
    extends: "./apps/admin/vitest.config.ts",
    test: {
      name: "admin",
      include: [r("./apps/admin/src/**/*.test.{ts,tsx}")],
    },
    resolve: {
      alias: [{ find: /^@\/(.*)$/, replacement: r("./apps/admin/src/$1") }],
    },
  },
]);
