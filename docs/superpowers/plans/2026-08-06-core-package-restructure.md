# Core Package Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the domain into a standalone `@headless-lms/core` package (absorbing `@headless-lms/types` minus the editor contract), move every adapter out of `@headless-lms/server` into the `adapters/` workspace folder, and shrink server to composition (`app`) + HTTP.

**Architecture:** `packages/core` holds the 9 bounded contexts + `shared` + `reporting` + the folded-in wire types and zod schemas, exposed through per-context subpath exports so index-only imports are physically enforced. `@headless-lms/types` dissolves: its root types and `/schemas` move into core (`@headless-lms/core/types`, `@headless-lms/core/schemas`) — they are consumed exclusively by server-side code; its React-bound `/editor` entry becomes a standalone `@headless-lms/editor` package consumed by the frontends and content-plate. In-server adapters become three workspace packages: `@headless-lms/adapter-db` (drizzle client, all schema incl. better-auth tables, repositories, unit-of-work, migrations, `runMigrations`), `@headless-lms/adapter-auth` (better-auth), `@headless-lms/adapter-defaults` (in-process event bus + outbox relay, pino logging, inline workflow engine, fail-loud email/storage stubs). `@headless-lms/server` keeps `app/` + `http/` and depends on the new packages.

**Tech Stack:** pnpm workspace, tsdown (unbundled, mirrors src→dist), TypeScript NodeNext, vitest (colocated tests, discovered by root `vitest run`), drizzle-kit, eslint legacy `.eslintrc.cjs`.

## Global Constraints

- No code comments beyond what the moved files already carry (AGENTS.md).
- No AI-attribution trailers in commits (AGENTS.md — overrides any default).
- Package naming follows the existing convention: `@headless-lms/adapter-<name>`, directory `adapters/<name>`.
- Every task ends green: `pnpm -r typecheck && pnpm test && pnpm -r build` must pass before its commit (plus `pnpm lint` from Task 6 on; lint is knowingly broken between Task 1 and Task 6 because `.eslintrc.cjs` globs point at old paths — do not run it as a gate until Task 6).
- All moves use `git mv` so history follows.
- macOS sed: `sed -i '' -E`. Import specifiers appear in both quote styles (`'` in server, `"` in some adapters/apps) — every codemod pattern below uses `[\"']` on both sides.
- Node `exports` and TS `paths` pattern precedence: longest specific prefix wins — the ordering used below depends on it.

## Preflight (before Task 1)

- [ ] Working tree must be clean. The tree currently carries a large in-flight change set (assets/entitlements/events work). Land or stash it first; do not interleave this restructure with it.
- [ ] Record a baseline: run `pnpm -r typecheck && pnpm test && pnpm -r build && pnpm lint` — all four must pass before starting. If the baseline is red, stop and report.

---

### Task 1: Extract `@headless-lms/core`

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/tsdown.config.ts`
- Move: `packages/server/src/core/*` → `packages/core/src/*`; `packages/server/src/reporting` → `packages/core/src/reporting`
- Modify: `packages/core/src/identity/service.ts` (+ its test), `packages/core/src/reporting/**` (relative-import depth), every `packages/server/src/**/*.ts` importing `core/` or `reporting/` (codemod), `tsconfig.base.json`, `packages/server/package.json`
- Test: existing colocated tests move with their sources; no new tests — the gate is typecheck + full suite + build.

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: package `@headless-lms/core` with subpaths `@headless-lms/core/<context>` (context index only), `@headless-lms/core/shared/<file>`, `@headless-lms/core/reporting/<name>`. Later tasks import e.g. `@headless-lms/core/shared/ports`, `@headless-lms/core/content`, `@headless-lms/core/reporting/learn`. (Task 2 adds `./types` and `./schemas` subpaths.)

- [ ] **Step 1: Scaffold the package**

`packages/core/package.json`:

```json
{
  "name": "@headless-lms/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "exports": {
    "./shared/*": {
      "types": "./dist/shared/*.d.ts",
      "default": "./dist/shared/*.js"
    },
    "./reporting/*": {
      "types": "./dist/reporting/*/index.d.ts",
      "default": "./dist/reporting/*/index.js"
    },
    "./*": {
      "types": "./dist/*/index.d.ts",
      "default": "./dist/*/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "test": "vitest run",
    "lint": "eslint src",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@headless-lms/types": "workspace:*",
    "ksuid": "^3.0.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsdown": "^0.22.9",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

(The `@headless-lms/types` dependency is temporary — Task 2 removes it when types folds in.)

The exports map is the enforcement mechanism: `@headless-lms/core/content` resolves only to `dist/content/index.js`; `@headless-lms/core/content/service` resolves to nothing. `./shared/*` and `./reporting/*` are listed before the wildcard and win by longest-prefix.

`packages/core/tsconfig.json` (copy of server's):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "composite": false,
    "declaration": false,
    "declarationMap": false
  },
  "include": ["src/**/*.ts"]
}
```

`packages/core/tsdown.config.ts` (same unbundled shape as server's):

```ts
import { defineConfig } from 'tsdown';

export default defineConfig({
  unbundle: true,
  entry: ['src/**/*.ts', '!src/**/*.test.ts'],
  outDir: 'dist',
  format: ['esm'],
  fixedExtension: false,
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: true,
});
```

- [ ] **Step 2: Move the sources**

```bash
mkdir -p packages/core/src
for d in assets automations content discussion entitlements identity integrations organizations progress shared; do
  git mv packages/server/src/core/$d packages/core/src/$d
done
git mv packages/server/src/reporting packages/core/src/reporting
rmdir packages/server/src/core
```

- [ ] **Step 3: Fix intra-package relative imports that changed depth**

Reporting used to reach core via `../../core/...`; core is now its parent directory:

```bash
grep -rl "\.\./\.\./core/" packages/core/src/reporting --include='*.ts' | xargs sed -i '' -E "s|from ['\"]\.\./\.\./core/|from '../../|g"
```

Fix the self-import that becomes a package cycle — in `packages/core/src/identity/service.ts` and `packages/core/src/identity/service.test.ts` replace:

```ts
import type { Mailer } from '@headless-lms/server';
```

with:

```ts
import type { Mailer } from '../shared/mailer.js';
```

- [ ] **Step 4: Register the package in the workspace**

In `tsconfig.base.json` `paths`, add:

```json
"@headless-lms/core/shared/*": ["./packages/core/src/shared/*.ts"],
"@headless-lms/core/reporting/*": ["./packages/core/src/reporting/*/index.ts"],
"@headless-lms/core/*": ["./packages/core/src/*/index.ts"],
```

In `packages/server/package.json` dependencies, add:

```json
"@headless-lms/core": "workspace:*",
```

Then `pnpm install`.

- [ ] **Step 5: Codemod server imports to package specifiers**

```bash
grep -rl -E "from ['\"](\.\./)+(core|reporting)/" packages/server/src --include='*.ts' | xargs sed -i '' -E \
  -e "s|from ['\"](\.\./)+core/shared/([a-z-]+)\.js['\"]|from '@headless-lms/core/shared/\2'|g" \
  -e "s|from ['\"](\.\./)+core/([a-z]+)/index\.js['\"]|from '@headless-lms/core/\2'|g" \
  -e "s|from ['\"](\.\./)+core/([a-z]+)/(ports\|model\|types\|events)\.js['\"]|from '@headless-lms/core/\2'|g" \
  -e "s|from ['\"](\.\./)+reporting/([a-z]+)/index\.js['\"]|from '@headless-lms/core/reporting/\2'|g" \
  -e "s|from ['\"](\.\./)+reporting/([a-z]+)/(ports\|model)\.js['\"]|from '@headless-lms/core/reporting/\2'|g"
```

Note the third expression: deep imports of `ports.js`/`model.js`/`types.js`/`events.js` are deliberately rerouted through the context index — that is the AGENTS.md rule the old layout let adapters skip.

Also fix `packages/server/src/index.ts:31` (`export type { Mailer } from './core/shared/mailer.js'`):

```ts
export type { Mailer } from '@headless-lms/core/shared/mailer';
```

- [ ] **Step 6: Typecheck and patch context indexes**

Run: `pnpm --filter @headless-lms/core --filter @headless-lms/server typecheck`

Expected failure mode: names that adapters deep-imported but a context index does not re-export (known candidates from the audit: `ProgressTarget` from `progress/types.js`, plus whatever surfaces in organizations/automations/integrations/content). For each missing name, add an explicit re-export to that context's `index.ts`, e.g. in `packages/core/src/progress/index.ts`:

```ts
export type { ProgressTarget } from './types.js';
```

Do NOT weaken the exports map to make a deep import work. Re-run typecheck until clean.

- [ ] **Step 7: Full gate**

Run: `pnpm -r typecheck && pnpm test && pnpm -r build`
Expected: all pass. (`pnpm lint` is expected red until Task 6 — do not chase it here.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: extract @headless-lms/core package (contexts, shared, reporting)"
```

---

### Task 2: Fold `@headless-lms/types` into core; extract `@headless-lms/editor`

The consumer audit that licenses this: root types are imported only by `packages/server/src` (48) and `plugins/slack` (1, `Integration`); `/schemas` only by `packages/server/src` (32); `/editor` only by `apps/admin` (3 files), `apps/student` (5), `plugins/content-plate` — and the editor sources import nothing from the rest of the types package (verified: zero relative or package imports back into types). `sdk`, `api-contract`, `cli`, `website` import nothing from types.

**Files:**
- Create: `packages/editor/package.json`, `packages/editor/tsconfig.json`, `packages/editor/tsdown.config.ts`
- Move: `packages/types/src/editor/*` → `packages/editor/src/*`; remaining `packages/types/src/*` (incl. `schemas/`) → `packages/core/src/types/*`
- Delete: `packages/types/` (package.json, configs — everything left after the moves)
- Modify: `packages/core/package.json` (exports + deps), `packages/core/src/shared/ports.ts`, `packages/core/src/**` internal types imports, `packages/server/src/**` + `plugins/slack/src/index.ts` + `adapters/{storage-minio,email-resend,workflow-hatchet,email-templates}/src/**` (codemods), `apps/admin`, `apps/student`, `plugins/content-plate` (editor imports + package.json deps), `tsconfig.base.json`, every package.json depending on `@headless-lms/types`
- Test: existing tests; gate is typecheck + suite + build for all workspaces including apps.

**Interfaces:**
- Consumes: `packages/core` layout from Task 1.
- Produces: `@headless-lms/core/types` (everything the old types root exported, ports included) and `@headless-lms/core/schemas` (the zod schemas); `@headless-lms/editor` (the React-bound editor contract, formerly `@headless-lms/types/editor`). `@headless-lms/types` no longer exists. Later tasks import port interfaces from `@headless-lms/core/shared/ports` (which re-exports them) or `@headless-lms/core/types` — both resolve to the same declarations.

- [ ] **Step 1: Move the types tree into core**

Keep `schemas/` nested under `types/` so no internal relative import inside the moved tree changes:

```bash
mkdir -p packages/core/src/types
git mv packages/types/src/editor /tmp-editor-staging 2>/dev/null || true   # staged below in Step 3; use scratch dir if /tmp is blocked
for f in packages/types/src/*; do git mv "$f" packages/core/src/types/; done
```

(If staging via a temp dir is awkward, order it the other way: do Step 3's `git mv packages/types/src/editor packages/editor/src` FIRST, then move the remainder. The end state is what matters: `packages/core/src/types/{assets,automations,content,discussion,email-templates,entitlements,events,identity,index,integrations,organizations,ports,progress,shared}.ts` + `packages/core/src/types/schemas/`.)

Then remove the editor export line from `packages/core/src/types/index.ts` if the old `packages/types/src/index.ts` re-exported it (it exposes editor via a subpath, not the root — verify; only edit if a root re-export exists).

- [ ] **Step 2: Wire the new core subpaths**

`packages/core/package.json` — add explicit entries ABOVE the `./*` wildcard (explicit beats wildcard regardless, but keep them grouped for readability):

```json
"./types": {
  "types": "./dist/types/index.d.ts",
  "default": "./dist/types/index.js"
},
"./schemas": {
  "types": "./dist/types/schemas/index.d.ts",
  "default": "./dist/types/schemas/index.js"
},
```

Remove `"@headless-lms/types": "workspace:*"` from core's dependencies (zod and ksuid already present — zod is what types needed).

`tsconfig.base.json`: delete the three `@headless-lms/types*` path entries; add:

```json
"@headless-lms/core/types": ["./packages/core/src/types/index.ts"],
"@headless-lms/core/schemas": ["./packages/core/src/types/schemas/index.ts"],
"@headless-lms/editor": ["./packages/editor/src/index.ts"],
```

`packages/core/src/shared/ports.ts`: its big `import type {...} from '@headless-lms/types'` block becomes a relative import — same names, new source:

```ts
import type { ... } from '../types/index.js';
```

(keep the existing re-export block as-is; it is what makes `@headless-lms/core/shared/ports` the canonical port surface). Codemod any other `@headless-lms/types` imports inside `packages/core/src` the same way:

```bash
grep -rl "@headless-lms/types" packages/core/src --include='*.ts' | xargs sed -i '' -E \
  -e "s|from ['\"]@headless-lms/types/schemas['\"]|from '../types/schemas/index.js'|g" \
  -e "s|from ['\"]@headless-lms/types['\"]|from '../types/index.js'|g"
```

then fix up relative depth by hand where a file sits deeper than one level below `src/` (e.g. context files at `src/<ctx>/service.ts` need `../types/index.js`; reporting files at `src/reporting/<name>/service.ts` need `../../types/index.js`). Run core typecheck to flush these: `pnpm --filter @headless-lms/core typecheck`.

- [ ] **Step 3: Extract `@headless-lms/editor`**

```bash
mkdir -p packages/editor/src
git mv packages/types/src/editor/* packages/editor/src/   # or from the staging dir if Step 1 staged it
```

`packages/editor/package.json` (inherits the old types package's React handling):

```json
{
  "name": "@headless-lms/editor",
  "version": "0.0.0",
  "private": true,
  "description": "Editor content contract (React-bound). The server never imports this.",
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^26.1.2",
    "@types/react": "^19",
    "tsdown": "^0.22.9",
    "typescript": "^5.7.2"
  }
}
```

Add `"zod": "4.4.3"` to dependencies only if `grep -rn "from ['\"]zod" packages/editor/src` hits. `tsconfig.json`: copy `packages/types/tsconfig.json` before deleting it. `tsdown.config.ts`:

```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  external: ["react"],
  fixedExtension: false,
  dts: true,
  clean: true,
});
```

Delete what's left of `packages/types/` (`git rm -r packages/types`).

- [ ] **Step 4: Codemod all external consumers**

Order matters — `/editor` and `/schemas` rewrites must run before the bare-root rewrite:

```bash
grep -rl "@headless-lms/types" apps packages plugins adapters --include='*.ts' --include='*.tsx' \
  --exclude-dir=node_modules --exclude-dir=dist 2>/dev/null | xargs sed -i '' -E \
  -e "s|(['\"])@headless-lms/types/editor(['\"])|\1@headless-lms/editor\2|g" \
  -e "s|(['\"])@headless-lms/types/schemas(['\"])|\1@headless-lms/core/schemas\2|g" \
  -e "s|(['\"])@headless-lms/types(['\"])|\1@headless-lms/core/types\2|g"
```

package.json dependency swaps (then `pnpm install`):
- `apps/admin`, `apps/student`, `plugins/content-plate`: `"@headless-lms/types"` → `"@headless-lms/editor": "workspace:*"`.
- `packages/server`, `plugins/slack`, `adapters/{storage-minio,email-resend,workflow-hatchet,email-templates}` (last one: verify it exists first — it appears in apps/api imports but was not audited): `"@headless-lms/types"` → `"@headless-lms/core": "workspace:*"` (server already has core; just delete the types line).
- Any remaining `@headless-lms/types` in a package.json after the sweep: same swap. Find them: `grep -rn "@headless-lms/types" --include=package.json . | grep -v node_modules`.

- [ ] **Step 5: Full gate**

Run: `pnpm -r typecheck && pnpm test && pnpm -r build`
Expected: pass — this includes the Next.js apps' typechecks picking up `@headless-lms/editor`.

Residue check (must be empty):

```bash
grep -rn "@headless-lms/types" . --include='*.ts' --include='*.tsx' --include=package.json | grep -v node_modules | grep -v pnpm-lock
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: fold @headless-lms/types into core; extract @headless-lms/editor"
```

---

### Task 3: Extract `@headless-lms/adapter-db`

**Files:**
- Create: `adapters/db/package.json`, `adapters/db/tsconfig.json`, `adapters/db/tsdown.config.ts`, `adapters/db/src/index.ts` (barrel), `adapters/db/src/migrations.ts`
- Move: `packages/server/src/adapters/db/*` → `adapters/db/src/*` (with `index.ts` → `client.ts`); `packages/server/src/adapters/auth/schema.ts` → `adapters/db/src/schema/better-auth.ts`; `packages/server/src/app/migrate.ts` (+ test) → `adapters/db/src/migrate.ts`; `packages/server/drizzle.config.ts` → `adapters/db/drizzle.config.ts`; `packages/server/drizzle/` → `adapters/db/drizzle/`
- Modify: `packages/server/src/app/container.ts`, `packages/server/src/app/db.ts`, `packages/server/src/index.ts`, `packages/server/src/adapters/auth/better-auth.ts`, `packages/server/package.json`, root `package.json` (db:* filters), `tsconfig.base.json`
- Test: moved colocated tests; gate is typecheck + suite + build.

**Interfaces:**
- Consumes: `@headless-lms/core/*` subpaths (Tasks 1–2).
- Produces: `@headless-lms/adapter-db` root export: `createDb`, `schema`, `type Db` (from `client.ts`), every `Drizzle*Repository` class, the unit-of-work exports (keep whatever `unit-of-work.ts` exports today), `runMigrations`, `migrationsFolder`. Subpath `@headless-lms/adapter-db/schema/better-auth` exporting the `ba_*` tables (`user`, `session`, …) for Task 4.

- [ ] **Step 1: Scaffold**

`adapters/db/package.json`:

```json
{
  "name": "@headless-lms/adapter-db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./schema/better-auth": {
      "types": "./dist/schema/better-auth.d.ts",
      "default": "./dist/schema/better-auth.js"
    }
  },
  "files": ["dist", "drizzle"],
  "scripts": {
    "build": "tsdown",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "db:generate": "tsx --env-file=../../.env node_modules/drizzle-kit/bin.cjs generate",
    "db:migrate": "tsx --env-file=../../.env node_modules/drizzle-kit/bin.cjs migrate"
  },
  "dependencies": {
    "@headless-lms/core": "workspace:*",
    "drizzle-orm": "^0.45.2",
    "pg": "^8.13.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/pg": "^8.11.10",
    "drizzle-kit": "^0.31.10",
    "tsdown": "^0.22.9",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

`tsconfig.json` and `tsdown.config.ts`: identical content to `packages/core`'s from Task 1 Step 1.

- [ ] **Step 2: Move**

```bash
mkdir -p adapters/db/src
git mv packages/server/src/adapters/db/index.ts adapters/db/src/client.ts
for f in packages/server/src/adapters/db/*; do git mv "$f" adapters/db/src/; done
git mv packages/server/src/adapters/auth/schema.ts adapters/db/src/schema/better-auth.ts
git mv packages/server/src/app/migrate.ts adapters/db/src/migrate.ts
git mv packages/server/src/app/migrate.test.ts adapters/db/src/migrate.test.ts
git mv packages/server/drizzle.config.ts adapters/db/drizzle.config.ts
git mv packages/server/drizzle adapters/db/drizzle
```

- [ ] **Step 3: Rewrite internal specifiers**

```bash
grep -rl "auth/schema.js" adapters/db/src | xargs sed -i '' -E "s|from ['\"]\.\./\.\./auth/schema\.js['\"]|from '../schema/better-auth.js'|g"
```

`adapters/db/drizzle.config.ts` — schema paths change to:

```ts
schema: ['./src/schema/index.ts', './src/schema/better-auth.ts'],
```

`adapters/db/src/migrate.ts` — the migrations folder now sits at this package's root; the URL hop shrinks by one (`src/migrate.ts` and `dist/migrate.js` are both one level below the root):

```ts
return fileURLToPath(new URL('../drizzle/', import.meta.url));
```

Export the path helper for reuse — if `migrationsFolder` is currently private in `migrate.ts`, export it.

- [ ] **Step 4: Barrel**

`adapters/db/src/index.ts`:

```ts
export { createDb, schema, type Db } from './client.js';
export * from './unit-of-work.js';
export { runMigrations, migrationsFolder } from './migrate.js';
export * from './repositories/assets.js';
export * from './repositories/automations.js';
export * from './repositories/content.js';
export * from './repositories/credentials.js';
export * from './repositories/dashboard.js';
export * from './repositories/discussion.js';
export * from './repositories/entitlements.js';
export * from './repositories/identity.js';
export * from './repositories/integrations.js';
export * from './repositories/learn.js';
export * from './repositories/members.js';
export * from './repositories/org-user-profile.js';
export * from './repositories/organizations.js';
export * from './repositories/outbox.js';
export * from './repositories/progress.js';
export * from './repositories/settings.js';
export * from './repositories/students.js';
```

If `export *` collides (repos re-exporting same-named row types), switch the colliding files to named exports of just their repository classes.

- [ ] **Step 5: Rewire server**

- `tsconfig.base.json` paths: add `"@headless-lms/adapter-db": ["./adapters/db/src/index.ts"]` and `"@headless-lms/adapter-db/schema/better-auth": ["./adapters/db/src/schema/better-auth.ts"]`.
- `packages/server/package.json`: add `"@headless-lms/adapter-db": "workspace:*"`; remove `drizzle-kit` and the `db:generate`/`db:migrate` scripts; remove `"drizzle"` from `files`. Leave `drizzle-orm`/`pg`/`@types/pg` for now — Task 5 prunes after the last adapter leaves.
- Root `package.json`: `db:generate`/`db:migrate` filters change to `@headless-lms/adapter-db`.
- Codemod remaining server references:

```bash
grep -rl -E "from ['\"](\.\./)+adapters/db" packages/server/src --include='*.ts' | xargs sed -i '' -E \
  -e "s|from ['\"](\.\./)+adapters/db/repositories/[a-z-]+\.js['\"]|from '@headless-lms/adapter-db'|g" \
  -e "s|from ['\"](\.\./)+adapters/db/unit-of-work\.js['\"]|from '@headless-lms/adapter-db'|g" \
  -e "s|from ['\"](\.\./)+adapters/db/index\.js['\"]|from '@headless-lms/adapter-db'|g"
```

- `packages/server/src/app/db.ts` re-export becomes `export { createDb, schema, type Db } from '@headless-lms/adapter-db';`
- `packages/server/src/index.ts`: `export { runMigrations } from '@headless-lms/adapter-db';`
- `packages/server/src/adapters/auth/better-auth.ts`: `import * as authSchema from './schema.js'` becomes `import * as authSchema from '@headless-lms/adapter-db/schema/better-auth';`
- `pnpm install`.

- [ ] **Step 6: Full gate**

Run: `pnpm -r typecheck && pnpm test && pnpm -r build`
Expected: pass. Duplicate-export collisions from the barrel surface here — resolve per Step 4's note.

Also verify migrations still resolve: `pnpm --filter @headless-lms/cli test` (the cli migrate command consumes `runMigrations` via `@headless-lms/server`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: extract @headless-lms/adapter-db (schema, repositories, migrations)"
```

---

### Task 4: Extract `@headless-lms/adapter-auth`

**Files:**
- Create: `adapters/auth/package.json`, `adapters/auth/tsconfig.json`, `adapters/auth/tsdown.config.ts`
- Move: `packages/server/src/adapters/auth/{better-auth.ts,access.ts,access.test.ts,types.ts,index.ts}` → `adapters/auth/src/`
- Modify: `packages/server/src/**` importers of `adapters/auth`, `packages/server/package.json`, `tsconfig.base.json`
- Test: `access.test.ts` moves along; gate is typecheck + suite + build.

**Interfaces:**
- Consumes: `@headless-lms/adapter-db/schema/better-auth` (Task 3), `@headless-lms/core/{organizations,identity}`, `@headless-lms/core/shared/{ports,id}`, `@headless-lms/core/types` (`ActiveSession`, `SessionVerifier`, `NewOrganizationInput` — Task 2's codemod already repointed these).
- Produces: `@headless-lms/adapter-auth` root export re-exporting what the current `auth/index.ts` exports (`createAuth`, types, access artifacts).

- [ ] **Step 1: Scaffold** — same `tsconfig.json`/`tsdown.config.ts` as Task 3; `package.json`:

```json
{
  "name": "@headless-lms/adapter-auth",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@headless-lms/adapter-db": "workspace:*",
    "@headless-lms/core": "workspace:*",
    "better-auth": "^1.6.25",
    "drizzle-orm": "^0.45.2"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsdown": "^0.22.9",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Move and rewrite**

```bash
mkdir -p adapters/auth/src
for f in packages/server/src/adapters/auth/*; do git mv "$f" adapters/auth/src/; done
```

Verify the `'@headless-lms/adapter-db/schema/better-auth'` import landed in the moved `better-auth.ts` (Task 3 Step 5 rewrote it in place); relative `'../../core/...'` specifiers were already converted in Task 1.

- [ ] **Step 3: Rewire server** — `tsconfig.base.json` paths `"@headless-lms/adapter-auth": ["./adapters/auth/src/index.ts"]`; server dep `"@headless-lms/adapter-auth": "workspace:*"`; codemod:

```bash
grep -rl -E "from ['\"](\.\./)+adapters/auth/" packages/server/src --include='*.ts' | xargs sed -i '' -E \
  -e "s|from ['\"](\.\./)+adapters/auth/index\.js['\"]|from '@headless-lms/adapter-auth'|g" \
  -e "s|from ['\"](\.\./)+adapters/auth/([a-z-]+)\.js['\"]|from '@headless-lms/adapter-auth'|g"
```

(Second pattern catches direct `types.js`/`access.js` imports; add any missing names to `adapters/auth/src/index.ts` if typecheck complains.) `pnpm install`.

- [ ] **Step 4: Full gate** — `pnpm -r typecheck && pnpm test && pnpm -r build`. Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: extract @headless-lms/adapter-auth"
```

---

### Task 5: Extract `@headless-lms/adapter-defaults`

**Files:**
- Create: `adapters/defaults/package.json`, `adapters/defaults/tsconfig.json`, `adapters/defaults/tsdown.config.ts`
- Move: `packages/server/src/adapters/{email,storage,events,logging,workflows}` → `adapters/defaults/src/{email,storage,events,logging,workflows}`
- Modify: server importers, `packages/server/package.json` (dep prune), `packages/server/src/index.ts`, `tsconfig.base.json`
- Delete: `packages/server/src/adapters/` (now empty)
- Test: colocated tests move; gate is typecheck + suite + build.

**Interfaces:**
- Consumes: `@headless-lms/core/shared/*` (ports, logger), `@headless-lms/core/types` (event types).
- Produces: subpath exports `@headless-lms/adapter-defaults/email`, `/storage`, `/events`, `/events/outbox-relay`, `/logging`, `/logging/request-context`, `/workflows` — mirroring today's per-directory imports so no barrel-collision risk.

- [ ] **Step 1: Scaffold** — `tsconfig.json`/`tsdown.config.ts` as before; `package.json`:

```json
{
  "name": "@headless-lms/adapter-defaults",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./email": { "types": "./dist/email/index.d.ts", "default": "./dist/email/index.js" },
    "./storage": { "types": "./dist/storage/index.d.ts", "default": "./dist/storage/index.js" },
    "./events": { "types": "./dist/events/index.d.ts", "default": "./dist/events/index.js" },
    "./events/outbox-relay": { "types": "./dist/events/outbox-relay.d.ts", "default": "./dist/events/outbox-relay.js" },
    "./logging": { "types": "./dist/logging/index.d.ts", "default": "./dist/logging/index.js" },
    "./logging/request-context": { "types": "./dist/logging/request-context.d.ts", "default": "./dist/logging/request-context.js" },
    "./workflows": { "types": "./dist/workflows/index.d.ts", "default": "./dist/workflows/index.js" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@headless-lms/core": "workspace:*",
    "pino": "^10.3.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsdown": "^0.22.9",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Move**

```bash
mkdir -p adapters/defaults/src
for d in email storage events logging workflows; do
  git mv packages/server/src/adapters/$d adapters/defaults/src/$d
done
rmdir packages/server/src/adapters
```

- [ ] **Step 3: Rewire server** — `tsconfig.base.json` paths:

```json
"@headless-lms/adapter-defaults/*": ["./adapters/defaults/src/*/index.ts", "./adapters/defaults/src/*.ts"],
```

Server dep `"@headless-lms/adapter-defaults": "workspace:*"`; codemod:

```bash
grep -rl -E "from ['\"](\.\./)+adapters/" packages/server/src --include='*.ts' | xargs sed -i '' -E \
  -e "s|from ['\"](\.\./)+adapters/(email\|storage\|events\|logging\|workflows)/index\.js['\"]|from '@headless-lms/adapter-defaults/\2'|g" \
  -e "s|from ['\"](\.\./)+adapters/(events\|logging)/([a-z-]+)\.js['\"]|from '@headless-lms/adapter-defaults/\2/\3'|g"
```

`packages/server/src/index.ts`: `export { InlineAutomationEngine } from '@headless-lms/adapter-defaults/workflows';`

Prune `packages/server/package.json` dependencies: remove `drizzle-orm`, `pg`, `@types/pg`, `pino` **iff** `grep -rn "from ['\"]pg['\"]\|from ['\"]drizzle-orm\|from ['\"]pino" packages/server/src` comes back empty (fastify's logger option types may still need pino as a type dep — if typecheck fails, keep `pino`). `pnpm install`.

- [ ] **Step 4: Full gate** — `pnpm -r typecheck && pnpm test && pnpm -r build`. Expected: pass. `packages/server/src` now contains exactly `app/`, `http/`, `index.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: extract @headless-lms/adapter-defaults; server is app + http only"
```

---

### Task 6: Rewrite lint boundaries for the package layout

**Files:**
- Modify: `.eslintrc.cjs`, root `package.json` (drop `eslint-plugin-boundaries`, `eslint-import-resolver-typescript` devDeps)
- Test: `pnpm lint` green; deliberate-violation spot checks below.

**Interfaces:**
- Consumes: final package layout from Tasks 1–5.
- Produces: lint rules future work relies on; no code interfaces.

- [ ] **Step 1: Replace the config**

The package graph now enforces what `eslint-plugin-boundaries` did (core cannot see adapters — it doesn't depend on them; deep context imports die at the exports map). What lint must still hold: (a) core stays framework/persistence-free, (b) intra-core context→context goes through index, (c) core contexts don't import reporting, (d) the server never imports the React-bound editor contract, (e) adapter packages never import `@headless-lms/server`. Replace `.eslintrc.cjs` wholesale:

```js
const CONTEXTS = [
  "identity",
  "organizations",
  "content",
  "entitlements",
  "progress",
  "assets",
  "integrations",
  "automations",
  "discussion",
];

const CROSS_CONTEXT_DEEP_IMPORTS = [
  ...["service", "model", "types", "events"].map((f) => `../*/${f}.js`),
  ...CONTEXTS.map((c) => `../${c}/ports.js`),
];

module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    curly: ["error", "all"],
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-empty-object-type": "off",
  },
  overrides: [
    {
      files: ["packages/server/**/*.ts", "packages/core/**/*.ts", "adapters/*/src/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@headless-lms/editor",
                message: "the editor contract is React-bound; server-side code never imports it",
              },
            ],
          },
        ],
      },
    },
    {
      files: CONTEXTS.map((c) => `packages/core/src/${c}/**/*.ts`),
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              { name: "fastify", message: "core must be framework-free" },
              { name: "pg", message: "core must be runtime-free" },
              {
                name: "drizzle-orm",
                message: "core must be persistence-free; schema + repos live in @headless-lms/adapter-db",
              },
              { name: "@headless-lms/editor", message: "editor contract is React-bound" },
            ],
            patterns: [
              {
                group: ["drizzle-orm/*"],
                message: "core must be persistence-free",
              },
              {
                group: ["@headless-lms/adapter-*", "@headless-lms/server"],
                message: "core may not import adapters or the server",
              },
              {
                group: ["**/reporting/**", "@headless-lms/core/reporting/*"],
                message: "core contexts may not import reporting",
              },
              {
                group: CROSS_CONTEXT_DEEP_IMPORTS,
                message: "import another context only via its public index.ts",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/core/src/reporting/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@headless-lms/adapter-*", "@headless-lms/server", "drizzle-orm", "drizzle-orm/*"],
                message: "reporting composes core surfaces only",
              },
              {
                group: ["../../*/service.js", "../../*/model.js", "../../*/types.js", "../../*/events.js", "../../*/ports.js"],
                message: "reporting imports a context only via its public index.ts",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["adapters/*/src/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              { group: ["@headless-lms/server", "@headless-lms/server/*"], message: "adapters implement core ports; they never import the server" },
            ],
          },
        ],
      },
    },
  ],
};
```

Note `reporting`'s cross-context ban uses `../../*/...` (contexts are one level up from `reporting/<name>/`), unlike the contexts' `../*/...`.

- [ ] **Step 2: Remove dead devDeps** — root `package.json`: delete `eslint-plugin-boundaries` and `eslint-import-resolver-typescript`; `pnpm install`.

- [ ] **Step 3: Verify the rules bite** — temporarily add `import 'drizzle-orm';` to `packages/core/src/content/service.ts` → `pnpm lint` must fail; revert. Temporarily add `import '@headless-lms/server';` to `adapters/db/src/client.ts` → must fail; revert.

- [ ] **Step 4: Full gate** — `pnpm lint && pnpm -r typecheck && pnpm test`. Expected: all pass, first fully-green lint since Task 1.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(lint): replace boundaries plugin with package-layout import rules"
```

---

### Task 7: Update the written architecture docs

**Files:**
- Modify: `AGENTS.md` (Import boundaries section), `docs/architecture.md`, `apps/website/content/docs/{architecture,project-structure,self-hosting}.mdx`, `apps/website/content/docs/adapters/index.mdx` (grep-verify each actually references the old layout before editing)
- Test: reading pass; `pnpm lint` stays green.

**Interfaces:** none — prose only.

- [ ] **Step 1: AGENTS.md** — replace the Import boundaries section body with the package-layout version:

```markdown
### Import boundaries

- The contexts are listed in ./docs/domains. They live in `packages/core`.
- A context imports another context **only** through its `index.ts` — enforced by the
  `@headless-lms/core` exports map for external consumers and by lint inside the package.
  `core/shared` is the exception (cross-cutting, allowed, imported per-file:
  `@headless-lms/core/shared/ports`).
- Wire types live at `@headless-lms/core/types`, zod schemas at `@headless-lms/core/schemas`.
  The React-bound editor contract is `@headless-lms/editor`; server-side code never imports it.
- `@headless-lms/core` depends only on `zod` and `ksuid` — never on adapters, the server,
  fastify, pg, or drizzle.
- Adapters live in `adapters/*` as `@headless-lms/adapter-*` packages. They implement ports
  from `@headless-lms/core/shared/ports` (or a context's ports via its index) and never
  import `@headless-lms/server`.
- `reporting` lives in `packages/core/src/reporting` (`@headless-lms/core/reporting/*`):
  composed cross-context reads, no domain authority; contexts may not import it.
- `@headless-lms/server` is `app/` (composition root) + `http/` only.
```

- [ ] **Step 2: docs/architecture.md and website docs** — `grep -rn "src/adapters\|src/core\|src/reporting\|@headless-lms/types" docs apps/website/content` and update each hit to the new layout (`packages/core`, `packages/editor`, `adapters/*`). Keep domain docs implementation-free (per project convention) — only structural references change.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: architecture docs reflect core package + adapter packages layout"
```

---

### Task 8: Final verification sweep

**Files:** none new — this is the closing gate.

- [ ] **Step 1:** `pnpm -r build && pnpm -r typecheck && pnpm test && pnpm lint` — all green.
- [ ] **Step 2:** Boot check: `pnpm --filter @headless-lms/api dev` (or its start script) against a local database; confirm the server starts, runs migrations (`runMigrations` path now resolves inside `adapters/db/drizzle/`), and serves `/health` or the swagger route. Kill it.
- [ ] **Step 3:** `pnpm gen:sdk` — the OpenAPI + SDK generation still runs (schema-first contract untouched, but the api app's imports changed).
- [ ] **Step 4:** Residue scan — all must return nothing:

```bash
grep -rn "from ['\"].*adapters/" packages/server/src --include='*.ts'
grep -rn "\.\./core/\|\.\./\.\./core/" packages/server/src --include='*.ts'
grep -rn "@headless-lms/types" . --include='*.ts' --include='*.tsx' --include=package.json | grep -v node_modules | grep -v pnpm-lock
```

- [ ] **Step 5:** Commit any stragglers; otherwise done.

---

## Self-Review Notes

- **Known unknowns an executor will hit and how to resolve:** exact export names in `unit-of-work.ts`/`migrate.ts` (Step references say "match actual names"); whether `pino` stays a server type-dep (Task 5 Step 3 gives the test); barrel collisions in adapter-db (Task 3 Step 4 gives the fallback); context indexes missing re-exports (Task 1 Step 6 is the feedback loop — never widen the exports map); relative-depth fixups after Task 2's core-internal types codemod (Step 2's typecheck flushes them).
- **`adapters/email-templates`** appears in apps/api imports but was not audited; Task 2 Step 4 includes it conditionally — verify it exists before editing.
- **Editor self-containment is verified fact**, not assumption: `packages/types/src/editor/*.ts` has zero imports from the rest of the types package, so the Task 2 cut cannot dangle.
- **Old types quirk not carried over:** `@headless-lms/types` served `./schemas` from `src/` (not `dist/`); core serves schemas from `dist/` like everything else. If a runtime consumer turns out to have depended on source-serving (none found in the audit), surface it rather than silently reverting to src-serving.
