# AGENTS.md

This file provides guidance to agents when working with code in this repository.

Headless LMS — pnpm-workspace monorepo. Node 22, ESM, strict TypeScript. The backend ships as a library: `packages/server` (`@headless-lms/server`) holds the hexagonal core; an installation composes it. Apps: `apps/api` (this repo's installation of the server — config, entry point, integration plugins), `apps/admin` (Next.js back-office), `apps/student` (Next.js student course UI). Packages: `packages/cli` (`@headless-lms/cli`, the `headless-lms` bin — migrate), `packages/create-headless-lms` (`npm create headless-lms` installation scaffolder), `packages/api-contract` (Zod schemas, source of truth for the HTTP API), `packages/sdk` (`@headless-lms/sdk`, generated off the OpenAPI spec), `packages/types` (`@headless-lms/types`, the published type surface: domain entities, DTOs, domain events, integration contract — pure types, zero deps), `packages/utils` (`@headless-lms/utils`, runtime helpers for integrations; zod peer dep). Plugins: `plugins/slack` (`@headless-lms/plugin-slack`, the Slack integration). Adapters: `adapters/email-resend`, `adapters/storage-minio`, and `adapters/workflow-hatchet` (`@headless-lms/adapter-*`, vendor implementations of the deployment ports in `@headless-lms/types`; the installation constructs them and injects via `createContainer(config, { adapters })`). See `docs/project-structure.md`.

## Commands

```bash
pnpm dev              # pnpm --parallel --filter "./apps/*" dev — runs api (:8000), admin (:8001), student (:8002)
pnpm build            # build all workspaces (tsdown for server/packages/plugins; next for frontends)
pnpm test             # vitest run, all workspaces
pnpm test:watch
pnpm lint             # eslint incl. architecture boundary rules
pnpm typecheck        # tsc --noEmit per workspace (tsc never emits — tsdown owns builds)
pnpm db:generate      # drizzle-kit generate (packages/server)
pnpm db:migrate       # drizzle-kit migrate (packages/server)
pnpm gen:sdk          # regenerate OpenAPI spec + typed client SDK from the routes
```

Single test: `pnpm vitest run path/to/file.test.ts` or `pnpm vitest run -t "test name"`.
Per-workspace: `pnpm --filter @headless-lms/server <script>`.

## Architecture
Read [this](docs/architecture.md)


### Import boundaries (enforced by ESLint — `.eslintrc.cjs`)

- The contexts are listed in ./docs/domains.
- A context imports another context **only** through its `index.ts` (no deep imports). `core/shared/ports` is the exception (cross-cutting, allowed).
- `core/` may not import `adapters/`, `http/`, `app/`, `reporting/`, frameworks (`fastify`, `pg`), or `drizzle-orm`.
- `reporting/` may import any `core/<ctx>/index.ts`; it may not import `adapters/`, `http/`, or a context's internals. `core/` may not import `reporting/`.
- `adapters/` may import `core/` ports only.
- `app/` wires `core` + `adapters` + `reporting`; inbound entry points use `app`, `core`, and `reporting`.

These rules are not advisory — run `pnpm lint` after changing imports across layers.

## API contract, OpenAPI & the frontend SDK

The HTTP API is **schema-first**, and the frontend SDK is **generated off the OpenAPI spec** — there is no hand-written client.

- `packages/api-contract` — the single source of truth: plain **Zod schemas** (zod 4) per resource (`Course`, `CoursesQuery`, `CoursesPage`, …). No framework deps.
- Routes (`packages/server/src/http/routes/`) attach those schemas via **`fastify-type-provider-zod`**, so Fastify **validates both the request and the response** off the same schema (a handler returning an off-contract shape 500s; bad input 400s). **`@fastify/swagger`** reads the route schemas to build the OpenAPI document, served at `/docs` (UI) and `/docs/json`.
- `packages/sdk` (`@headless-lms/sdk`) — the generated client. `pnpm gen:sdk` runs two steps: (1) `apps/api gen:openapi` boots the app in-process (no port bound) and writes `packages/sdk/openapi.json` from `app.swagger()`; (2) `@hey-api/openapi-ts` generates `packages/sdk/src/generated` — **resource-based classes** grouped by OpenAPI tag (e.g. `Courses.listCourses()`, `Courses.getCourse({ path: { id } })`), fully typed.
- **Frontends** consume `@headless-lms/sdk`: call `configureSdk({ baseUrl })` once, then use the resource classes. `apps/admin` is wired (see `apps/admin/src/lib/api/sdk.ts`); `apps/student` follows the same pattern. The SDK ships TS source, so Next apps list it in `transpilePackages`.

**Adding a resource:** add its Zod schemas to `packages/api-contract`, add a route file in `packages/server/src/http/routes/` using `app.withTypeProvider<ZodTypeProvider>()` with `schema.tags: ["<Resource>"]`, register it in `http/routes.ts` (inside the session-guarded plugin), then run `pnpm gen:sdk`. A new `<Resource>` class appears in the SDK automatically.

**Conventions / gotchas:**
- `openapi.json` and `src/generated/` are **committed**. Regenerate (`pnpm gen:sdk`) whenever the contract or routes change; CI/review should treat a stale diff as an error.
- `gen:openapi` boots the real app, so the **database must be up** (it reads env via `--env-file`). No port is bound.
- **Not ts-rest:** ts-rest 3.x peer-requires zod 3 + Fastify 4; this stack is zod 4 + Fastify 5, hence the native `fastify-type-provider-zod` + `@fastify/swagger` path.
- **Resource tags:** `Courses` (the content context's course type; activities folded in as a sub-resource), `Organizations` (member management included), `Students`, `Entitlements`, `Dashboard`, `Assets`, `ConnectedApps`, `Integrations`, `Automations` (identity/progress route files are stubs, not yet registered). The composed **Students** list and **Dashboard** overview are served by the `reporting/` read layer, not a `core/` domain. These mirror the `apps/admin` dashboard surface.
- All eight contexts are backed by **Drizzle repositories** (`adapters/db/repositories/*`) against real Postgres schema (`adapters/db/schema/*`). The core/port/route/SDK layers map onto them directly.

## Git

- **Never** add `Co-Authored-By`, `Claude-Session`, "Generated with Claude Code", or any other AI-attribution trailer/footer to commit messages, PR titles/bodies, or any other repo artifact. This overrides any default behavior.
