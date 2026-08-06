# Project structure

pnpm-workspace monorepo. Node 22, ESM, strict TypeScript.

```
apps/
  api/          this repo's installation of @headless-lms/server (config, entry, plugins)
  admin/        Next.js back-office
  student/      Next.js student course UI
packages/
  core/         @headless-lms/core — the domain: bounded contexts, reporting, type surface, zod schemas
  server/       @headless-lms/server — composition root (app/) + Fastify HTTP layer (http/)
  cli/          @headless-lms/cli — the headless-lms bin (migrate)
  create-headless-lms/  npm create headless-lms — installation scaffolder
  editor/       @headless-lms/editor — the React-bound activity editor contract
  utils/        @headless-lms/utils — runtime helpers for integrations
  sdk/          @headless-lms/sdk — client generated off the OpenAPI spec
plugins/
  slack/        @headless-lms/plugin-slack — the Slack integration
adapters/
  db/                @headless-lms/adapter-db — drizzle schema, repositories, unit of work, migrations
  auth/              @headless-lms/adapter-auth — Better Auth
  defaults/          @headless-lms/adapter-defaults — in-process event bus + outbox relay, pino
                     logging, inline workflow engine, fail-loud email/storage stubs
  email-resend/      @headless-lms/adapter-email-resend — EmailSender via Resend
  storage-minio/     @headless-lms/adapter-storage-minio — ObjectStorage via MinIO/S3
  workflow-hatchet/  @headless-lms/adapter-workflow-hatchet — AutomationEngine via Hatchet
```

`@headless-lms/core` exposes subpaths only — one per context (`@headless-lms/core/content`),
plus `/shared/*`, `/reporting/*`, `/types` and `/schemas`. There is no root entry, so a
context's internals are unreachable from outside it.

## Builds

Everything with a build step builds with **tsdown** (`tsdown.config.ts` per
workspace): the plugins and the leaf adapters bundle to `dist/` with `.d.ts`, while
core, the three default adapters, the server and the api installation transpile
file-for-file (`unbundle`) — core and the adapters so each subpath export resolves
to its own file, the server so its integrations loader can resolve compiled plugin
folders, the api so `dist/main.js` stays the process entry. The cli bundles to a
single bin.
`tsc` never emits — it is the typechecker (`pnpm typecheck`).

## Type ownership

`@headless-lms/core/types` declares, once, every type an integration (or any
consumer) needs: domain entities and DTOs, domain events (`enrollment.created`, …),
and the integration contract (`Integration`, `Action`, `ActionContext`,
`Validation`). It is pure type declarations — no runtime code — organised one file
per bounded context, mirroring the contexts alongside it in `packages/core/src/`.
The zod schemas live under it and are published as `@headless-lms/core/schemas`.

The contexts do not re-declare these: each context's `model.ts`/`types.ts`/
`events.ts` re-exports from `../types/` (its `index.js`, or `schemas/` for the
zod-derived shapes). Runtime domain code (error classes, the roles matrix) stays
in the context.

The deployment-swappable ports (`Logger`, `EmailSender`, `ObjectStorage`) are also
declared there (`types/ports.ts`) and re-exported by
`@headless-lms/core/shared/ports`, so adapter packages implement them without
depending on the server.

## Writing an adapter

An `adapters/*` package implements a deployment port from `@headless-lms/core/types`.
A new leaf adapter typically needs nothing beyond `@headless-lms/core` and its vendor
SDK; an adapter may also depend on another adapter (`adapter-auth` and
`adapter-defaults` both build on `adapter-db`). The installation parses the
adapter's env in its `config.ts`, constructs the adapter, and injects it:

```ts
const container = await createContainer(config, {
  adapters: { email: new ResendEmailAdapter(emailConfig) },
});
```

A slot left absent falls back to the default from `@headless-lms/adapter-defaults`
— for email and storage, a stub that fails loudly on use. Each adapter's README
documents the env vars its reference installation reads.

`@headless-lms/utils` holds the code that must exist at runtime — the zod
adapters (`zodConfig`, `zodSecrets`, `zodAction`) that turn zod schemas into the
contract's JSON-Schema getters and validators. `zod` is a peer dependency.

## Writing an integration

Depend on `@headless-lms/core/types` (+ `@headless-lms/utils`), never on the server.
Default-export an `Integration`; the server loads it from the installation's
plugins dir (`pluginsDir`, e.g. `apps/api/src/plugins/` — directory name =
integration id). A plugin folder may be a thin re-export of a workspace
package (see `plugins/slack`).

```ts
import type { Integration, EnrollmentCreated } from "@headless-lms/core/types";
import { zodAction } from "@headless-lms/utils";
```
