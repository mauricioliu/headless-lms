// Two projects: the root config's suite (everything but apps/student) and the
// student app, whose components import through the `@/*` alias and so need a
// project-local alias to resolve under vitest. Without the split, one global
// `@/` alias would collide with apps/admin, which uses the same shorthand.
import { fileURLToPath } from "node:url";
import { defineWorkspace } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "main",
      include: ["**/src/**/*.test.{ts,tsx}"],
      exclude: ["**/node_modules/**", "**/dist/**", "apps/student/**"],
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
]);
