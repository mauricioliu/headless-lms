# AGENTS.md
Headless LMS.pnpm-workspace monorepo.

## Commands

see root level package.json

## Architecture
Read [this](docs/architecture.md)

### Import boundaries

- The contexts are listed in ./docs/domains.
- A context imports another context **only** through its `index.ts` (no deep imports). `core/shared/ports` is the exception (cross-cutting, allowed).
- `core/` may not import `adapters/`, `http/`, `app/`, `reporting/`, frameworks (`fastify`, `pg`), or `drizzle-orm`.
- `reporting/` may import any `core/<ctx>/index.ts`; it may not import `adapters/`, `http/`, or a context's internals. `core/` may not import `reporting/`.
- `adapters/` may import `core/` ports only.
- `app/` wires `core` + `adapters` + `reporting`; inbound entry points use `app`, `core`, and `reporting`.

These rules are not advisory — run `pnpm lint` after changing imports across layers.

## API contract, OpenAPI & the frontend SDK

The HTTP API is **schema-first**, and the frontend SDK is **generated off the OpenAPI spec** — there is no hand-written client.

## Frontend UI

Each app's UI conventions are binding and app-specific. Read the relevant one **before** writing or editing any
`.tsx`, not after:

- `apps/admin/AGENTS.md`
- `apps/student/AGENTS.md`

Both apps are shadcn-based with an existing set of house components. 
New UI copies an existing screen of the same kind.

## Coding standards
- Don't add comments in the code.
- **Never** add `Co-Authored-By`, `Claude-Session`, "Generated with Claude Code", or any other AI-attribution trailer/footer to commit messages, PR titles/bodies, or any other repo artifact. This overrides any default behavior.
