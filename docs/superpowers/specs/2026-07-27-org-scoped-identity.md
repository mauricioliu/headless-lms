# Unified Person / Org-Membership Identity — Specification

**Date:** 2026-07-27
**Branch:** `worktree-org-scoped-identity`

## Problem

The system models two actor kinds at two different levels of abstraction.

**Staff** are split across two rows:
- `users` (`adapters/db/schema/identity.ts:5`) — the human. Global, `external_id` → better-auth `user.id`, globally unique email.
- `memberships` (`adapters/db/schema/organizations.ts:32`) — the org participation. Org-scoped `(org_id, id)`, `user_id` → `users.id`.

**Students** fuse both into one row:
- `students` (`adapters/db/schema/identity.ts:25`) — org-scoped `(org_id, id)`, carrying the human's email/name *and* the org participation, with its own nullable `external_id` → better-auth `user.id`.

Consequences:

1. **No single actor key.** Any feature referencing "whoever did this" — comments, notes, audit trails, mentions — needs `(org_id, membership_id)` for staff and `(org_id, student_id)` for learners: two nullable columns plus a CHECK constraint, re-invented per feature.

2. **Unenforceable org scoping on actor references.** `organizations.owner_id` and `invitations.invited_by` are plain FKs to `users.id`. Nothing at the DB level stops a row in org A from citing a user with no membership in org A.

3. **Single-membership assumption is hard-coded.** `DrizzleOrganizationsRepository.findMembershipByUser` (`adapters/db/repositories/organizations.ts:236-246`) takes `userId` only and `LIMIT 1`s by `created_at`. `http/scope.ts:44` and `http/mcp/principal.ts:33` both call it, so a staff user in two orgs resolves to an arbitrary one regardless of the session's active org. The org switcher cannot work.

4. **Duplicated person data.** A human who is staff in org A and a student in org B has a `users` row *and* an unrelated `students` row, with independently editable name and email.

5. **`progress_records.student_id` has no FK at all** (`adapters/db/schema/progress.ts:20`) — the only student reference in the schema without referential integrity. `entitlements` is the sole table with the composite FK (`entitlements.ts:40-46`).

## Existing behaviour that constrains the design

- **Every better-auth account already gets a `users` row.** `adapters/auth/index.ts:229-241` (`databaseHooks.user.create.after`) calls `identity.registerUser` unconditionally. Students included. The global person table already holds every human; only the `students → users` link is missing. `http/scope.ts:6-11` documents this and works around it by requiring a membership.
- **Pending participants are load-bearing.** `identity.createStudent` (`core/identity/service.ts:60`) inserts a student with `external_id` NULL before any login exists. `entitlements.grant` (`core/entitlements/service.ts:29`) performs no acceptance check, so admins grant course access to pending students. The participation row must exist before acceptance.
- **Claim-on-accept already exists for students.** `linkPendingStudent` (`core/identity/service.ts:99`, repo at `adapters/db/repositories/identity.ts:153`) stamps `external_id` by matching `(org_id, email, external_id IS NULL)`. Staff have no equivalent — their pending state lives only in `invitations`, and membership is created by better-auth's `addMember` on acceptance (`core/organizations/service.ts:213`).
- **Invitations are domain-owned.** better-auth's native invitation endpoint is blocked (`adapters/auth/index.ts:142-146`); tokens are minted and hashed in core (`core/shared/invite-token.ts`).
- **Session carries the org.** For students, `databaseHooks.session.create.before` (`adapters/auth/index.ts:242-256`) stamps `activeOrganizationId` from `identity.studentOrgExternalId`, which only resolves when the login maps to exactly **one** student row (`adapters/db/repositories/identity.ts:89-97`).

## Decision

Adopt the **person / org-participation** split uniformly.

- `users` is the human. One row per real person, global, keyed to a better-auth account by `external_id`. Already true for every account today.
- **`memberships` is renamed `org_users`** and becomes the single org-participation table for *all* actor kinds. `students` stops being an identity and becomes a participation row of role `student`.
- Every actor-shaped foreign key targets `(org_id, org_user_id)`.

Rejected alternative: making staff fully org-isolated (`staff (org_id, id)` mirroring `students`). It would still need `external_id` back to better-auth on every isolated table, duplicating the identity-claim mechanism per table, and it makes the org switcher — one human, `owner` in one org, `instructor` in another — inexpressible without scanning `external_id` across tenants.

### Name

`memberships` → `org_users`. "Membership" is ambiguous in an LMS, where it also denotes a purchasable content type (a subscription granting access to content). `org_users` states exactly what the row is: a human's participation in one organization under one role.

Corresponding renames: `Membership` → `OrgUser`, `membershipId` → `orgUserId`, `AddMembershipInput` → `AddOrgUserInput`, `MembershipId` → `OrgUserId`, id prefix stays `orm` (already reads as *org member*).

## Target schema

```
users                     (global person — unchanged shape)
  id            PK
  external_id   UNIQUE      → better-auth user.id   (NOT NULL)
  email         UNIQUE
  display_name

org_users                 (org participation — was `memberships`)
  (org_id, id)  PK
  org_id                    → organizations.id
  user_id       NULLABLE    → users.id           NULL until claimed
  role                      'owner'|'admin'|'instructor'|'student'
  email                     the invited/participating address
  first_name
  last_name
  external_id   NULLABLE UNIQUE   better-auth member.id, staff only
  created_at, updated_at
  UNIQUE (org_id, email)
  UNIQUE (org_id, user_id)
```

- `user_id` NULL ⇔ pending participant (invited, not yet accepted). Replaces `students.external_id IS NULL`.
- `external_id` stays on the row for staff because better-auth's organization plugin owns the `member` record and its hooks address rows by `member.id`. Students have no better-auth member record → NULL.
- `students` table is dropped. Student rows migrate into `org_users` with `role = 'student'`.
- `courseAssignments.membership_id` → `org_user_id`; composite FK retargeted.
- `entitlements.student_id` → `org_user_id`; composite FK retargeted to `org_users`.
- `progress_records.student_id` → `org_user_id`, and **gains** the composite FK it currently lacks.

### Role model

`Role` widens from `owner|admin|instructor` to `owner|admin|instructor|student`. The authorization matrix (`core/organizations/roles.ts`) is `Record<Role, …>`, so the compiler forces a `student` entry. `student` gets `consume_content: 'enrolled'` and nothing else — matching the capability students effectively have today.

`STUDENT_ROLE` (already exported from `core/organizations/roles.ts`) becomes a real member of `ROLES` rather than a string used only for invitation branching.

Staff-only surfaces must filter `role != 'student'` explicitly. Today that separation is implicit in the table split, so **every query over `memberships` is a place a student row could now leak into a staff list.** Enumerated in the plan.

## Identity resolution changes

| Concern | Today | After |
|---|---|---|
| Staff scope resolution | `getMembershipByUser(userId)` — ignores active org | `getOrgUser(orgId, userId)` — org-explicit |
| Student scope resolution | `getStudentByExternalId(orgId, externalId)` | `getOrgUser(orgId, userId)` after `getUserByExternalId` |
| Pending marker | `students.external_id IS NULL` | `org_users.user_id IS NULL` |
| Claim on accept | `linkPendingStudent(orgId, email, externalId)` | `claimOrgUser(orgId, email, userId)` — same shape, both roles |
| Session org stamp | `studentOrgExternalId(externalId)`, single-student-row only | `soleOrgExternalId(userId)` — sole participation of any role |

`resolveScope` (`http/scope.ts`) gains org-explicit lookup, which is what makes the org switcher work: the active org from the session selects which `org_users` row (and therefore which role) applies.

## Invitation flow

Unchanged in shape. `createInvite` currently requires a pending student row to pre-exist for `role = 'student'` (`core/organizations/service.ts:134-137`) but does no such check for staff. After the refactor both roles create a pending `org_users` row at invite time, so the branch collapses:

1. Admin invites `email` with `role`.
2. `org_users` row created with `user_id = NULL`, role, email, name.
3. Invitation minted with the domain token, emailed.
4. On acceptance: better-auth account exists → `users` row exists (created by the auth hook) → `claimOrgUser` stamps `user_id`. For staff, `orgAdmin.grantMembership` still runs so better-auth's `member` record is created, and the `afterAddMember` hook stamps `external_id` onto the existing row instead of inserting a new one.

Admin-created students (`POST /students`) keep working: they create a pending `org_users` row exactly as before, just in the renamed table.

## Touchpoints

Complete inventory. Non-test source unless noted.

### Schema & migration
- `packages/server/src/adapters/db/schema/identity.ts` — drop `students`, keep `users`
- `packages/server/src/adapters/db/schema/organizations.ts` — `memberships` → `org_users` + new columns
- `packages/server/src/adapters/db/schema/entitlements.ts:23,40-47` — `student_id` → `org_user_id`
- `packages/server/src/adapters/db/schema/progress.ts:20,35` — `student_id` → `org_user_id` + add FK
- `packages/server/src/adapters/db/schema/index.ts` — re-exports
- `packages/server/drizzle/` — new migration (baseline is `0000_baseline.sql`)

### Published types
- `packages/types/src/identity.ts` — `Student` removed; `User` unchanged; student events retyped
- `packages/types/src/organizations.ts` — `Membership` → `OrgUser`, `Role` widened, `CourseAssignment.membershipId` → `orgUserId`
- `packages/types/src/entitlements.ts` — `studentId` → `orgUserId`
- `packages/types/src/progress.ts` — `studentId` → `orgUserId`
- `packages/types/src/content.ts` — membership reference
- `packages/types/src/email-templates.ts` — student invite payload

### Core
- `core/identity/{model,types,ports,service,events,index}.ts` + `service.test.ts`
- `core/organizations/{model,types,ports,service,roles,members,index}.ts` + `service.test.ts`, `roles.test.ts`
- `core/entitlements/service.ts` + `service.test.ts`
- `core/progress/{ports,service}.ts` + `service.test.ts`
- `core/automations/{actions,catalog}.ts` + `service.test.ts`
- `core/shared/id.ts` — `membership` → `orgUser` key (prefix `orm` unchanged); drop `student`

### Adapters
- `adapters/auth/index.ts` — `requireUser`, org hooks (`afterCreateOrganization`, `afterAddMember`, `afterRemoveMember`), session stamp hook
- `adapters/auth/org-admin.ts`, `access.ts` (+ `access.test.ts`), `session-stamp.ts`
- `adapters/db/repositories/identity.ts` — student methods → org-user methods
- `adapters/db/repositories/organizations.ts` — membership methods, `findMembershipByUser` → org-explicit
- `adapters/db/repositories/members.ts` — joins `users`, must exclude `role = 'student'`
- `adapters/db/repositories/students.ts` — reads `students` directly
- `adapters/db/repositories/{entitlements,progress,learn,dashboard}.ts`
- `adapters/workflows/index.test.ts`

### HTTP
- `http/scope.ts` (+ `scope.test.ts`), `http/student-scope.ts` (+ test)
- `http/mcp/{principal,authz,tools}.ts` (+ tests)
- `http/routes/{students,entitlements,organizations,learn,assets}.ts`, `http/routes.ts`
- `http/plugins/{cors,error-handler,openapi}.ts`

### Reporting
- `reporting/students/{model,ports,service,index}.ts`
- `reporting/learn/{model,ports,service}.ts` + `service.test.ts`
- `reporting/dashboard/model.ts`

### App
- `app/container.ts`, `app/notifications.ts` (+ test)

### Contract & SDK
- `packages/api-contract/src/{students,entitlements,dashboard,learn,invites,index}.ts`
- `packages/sdk/openapi.json`, `packages/sdk/src/generated/*` — regenerated via `pnpm gen:sdk`

### Plugins & adapters (workspace)
- `plugins/slack/src/notifications/{formatters,schema}.ts` + `formatters.test.ts`
- `plugins/slack/src/actions/post-to-channel.ts`, `plugin.test.ts`
- `adapters/email-templates/src/emails/{student-invite,access-granted}.tsx`, `index.tsx` + tests

### Frontends
- `apps/admin` — students pages/actions/columns/sheets, entitlements pages/actions/columns, settings/team members table + invite sheet, `lib/api/types.ts`, `lib/query-keys.ts`, `lib/auth/server-session.ts`, `lib/roles.ts`, dashboard overview
- `apps/student` — `lib/auth/server-session.ts`, `lib/api/{server,shared}.ts`, `lib/progress-reporter.ts`, `proxy.ts`, dashboard + player components

### Docs
- `docs/domain/{identity,organizations,entitlements}.md`
- `docs/architecture.md`
- `AGENTS.md` — multi-tenancy section describes `students` as org-scoped identity

## Data migration

Single migration, forward-only. The baseline is `0000_baseline.sql` and this is pre-1.0, but existing deployments exist, so the migration must preserve data.

1. Rename `memberships` → `org_users`; rename constraints/indexes.
2. Add `email`, `first_name`, `last_name`, `updated_at` to `org_users`; make `user_id` and `external_id` nullable.
3. Backfill `org_users.email/first_name/last_name` from the joined `users` row (staff `display_name` splits on first space; remainder → `last_name`, empty string when absent).
4. Insert one `org_users` row per `students` row: `role = 'student'`, `user_id` = the `users.id` whose `external_id` matches `students.external_id` (NULL when the student is pending), `external_id = NULL`, preserving `students.id` as `org_users.id` so dependent FKs need no value rewrite.
5. Rename `entitlements.student_id` → `org_user_id`, `progress_records.student_id` → `org_user_id`, `course_assignments.membership_id` → `org_user_id`; retarget composite FKs; add the missing `progress_records` FK.
6. Drop `students`.

Step 4 preserving `students.id` (prefix `stu_`) means existing student ids remain valid in `org_users`, so entitlements/progress rows keep pointing at the right participant. New rows get `orm_`. Mixed prefixes are cosmetic; no code branches on the prefix.

A pre-existing human who is both staff in org A and a student in org A would collide on `UNIQUE (org_id, email)`. The migration must detect this and fail loudly with the offending rows rather than silently dropping one.

## Verification

- `pnpm typecheck` — the widened `Role` and renamed types make the compiler enumerate most call sites
- `pnpm lint` — architecture boundary rules
- `pnpm test` — baseline is 49 files / 375 tests passing
- `pnpm gen:sdk` — regenerates spec + client; requires a running database
- Manual: staff login → dashboard; student login → portal; admin creates student → invite → accept → portal access; entitlement granted to a pending student survives acceptance
