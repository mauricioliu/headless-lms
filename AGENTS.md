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
