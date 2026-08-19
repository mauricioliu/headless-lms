# Waves — Domain Spec

Owns the **Ola**: a named group of Trabajadores inscribed together in one Curso, and the rules of its bulk ingestion from the Empresa Cliente's roster CSV. An Ola is the unit the pilot's operational gate (>80% Completado) is read against — as a grouping and a report row, never as an automation trigger.

## Scope

- Owns the **wave** (the Ola row: name, the Curso it is for, its org) and the **wave membership** (which Trabajadores ride the Ola).
- Owns **roster CSV parsing** — the contract the Admin Cliente's file must satisfy: columns RUT, nombre, teléfono and correo, with every validation error reported row by row.
- Owns the ingestion orchestration rules: who is provisioned, who is re-invited, who gets no email.
- Does **not** own the person (identity), the org link or the invitation (organizations), the access grant (entitlements), the Curso (content), or completion (progress).

## Ingestion

One call ingests one Ola: parse the roster, check the Curso exists, then per Trabajador:

1. **Provision** — a Trabajador new to the org gets a person (identity), an org user with role `student` and status `invited` (organizations), and a pending invitation whose **token exists only in the invitation email**. Nothing in any API response carries it.
2. **Inscribe** — an entitlement to the Ola's Curso is granted (source `ola`), idempotent per Trabajador per content.
3. **Group** — a membership row links the Trabajador to the wave.

An already-active Trabajador riding a later Ola gets **no email**: their inscription is the entitlement, and their roster fields (RUT, teléfono, nombres) are refreshed from the CSV — the file is the Empresa Cliente's canonical roster. A Trabajador still pending is re-invited (fresh token, old token dead), which is the same act as the manual re-invite.

Duplicate correos within one file are the same Trabajador — first occurrence wins. Re-ingesting the same file creates a **new** Ola (the ingestion is not idempotent on purpose); a malformed file is rejected whole, before anything is created.

## Model

- **Wave** — `(org, id)`, a name, the Curso it is for, and its member count. Immutable: a correction is a new Ola, not an edit.
- **WaveMember** — `(wave, org user)`; the same Trabajador may ride later Olas of the same Curso.
- **WorkerRow** — one parsed CSV line: RUT, nombre (split into first/last), teléfono, correo.

## Identity rules

The **correo is the identity** — possession of the corporate mailbox is what the invitation attests. RUT and teléfono are stored roster data on the person, surfaced to staff reads and the report; **no authentication path consults them**, and they never appear in any email. There is no RUT verification and no phone-based access.

## Boundaries

1. **waves → identity** — provisioning and roster refresh go through identity's person service; waves never writes the person directly.
2. **waves → organizations** — the invitation and the org user are organizations'; waves decides _whether_ one is issued, never _how_.
3. **waves → entitlements** — inscription is an entitlements grant like any other; waves only chooses the source marker.
4. **waves → content** — the Curso referenced must exist in the org; deleting the Curso cascades the Ola with it.

## Events

- `wave.created` — the wave snapshot (org, id, name, Curso, member count), emitted in the ingestion transaction. Carries no roster data and no tokens.

## Build state

Built and **persisted** (HTTP seam, storage, outbox event, captured-email tests). The per-Ola progress table and CSV report (#23) read this grouping; the admin surface (#25) rides the same endpoints.
