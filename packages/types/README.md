# @headless-lms/types

The platform's published type surface: domain entities, DTOs, domain events
(`enrollment.created`, `connection.updated`, …), and the integration contract
(`Integration`, `Action`, `ActionContext`, `Validation`).

Pure type declarations — no runtime code, no dependencies. One file per bounded
context, mirroring `packages/server/src/core/`. The server's core imports these types
rather than declaring its own, so an integration package and the platform always
share one definition.

```ts
import type { Integration, EnrollmentCreated, Course } from "@headless-lms/types";
```

## `@headless-lms/types/editor`

Separate entry holding the contract for the swappable activity content editor.
An editor implementation (e.g. `@headless-lms/content-plate`) default-exports
an `EditorModule`; the admin app selects exactly one per deployment in its
`src/editor.config.tsx`. The backend stores the editor's output as an opaque
blob inside the activity's `settings` and never inspects it.

- `Editor` — client component (`'use client'` entry) receiving
  `{ initialConfig, onSave }`.
- `Renderer` — RSC-safe component rendering a stored config.
- `validate` — optional structural check run before saving.
- `meta.type` (+ optional `meta.version`) — unique format tag stored with
  every config; a renderer must refuse configs of a foreign type or version.

These types are React-bound, which is why they live in their own entry: the
server imports only the package root (lint-enforced), so React types never
reach its graph.
