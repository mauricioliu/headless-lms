# Unified Person / Org-Membership Identity — Implementation Plan

> **Status: executed.** Commits `f3c04f6`, `a7b21ca`, `ac7d221`, `461d9db`, `e478a17`, `54e986d` on `worktree-org-scoped-identity`. Five decisions diverged from the plan as written — see *Deviations* at the bottom before treating any task body as the record of what was built.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the two actor models (global staff `users` + `memberships`, org-scoped `students`) into one — a global person (`users`) linked to an organization by a single org-scoped participation row (`org_users`) carrying the role.

**Architecture:** `users` stays the global human, already provisioned for every better-auth account by `adapters/auth/index.ts:229-241`. `memberships` is renamed `org_users` and absorbs the participation fields students carried (`email`, `first_name`, `last_name`) plus a nullable `user_id` that is NULL while the participant is pending. `students` is dropped and its rows migrate in as `role = 'student'`. Every actor-shaped FK retargets `(org_id, org_user_id)`.

**Tech Stack:** TypeScript (strict, ESM, Node 22), Drizzle ORM + Postgres, Fastify 5, zod 4 + `fastify-type-provider-zod`, better-auth (organization + mcp plugins), Vitest, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-07-27-org-scoped-identity.md`

## Global Constraints

- Node 22, ESM, strict TypeScript. `tsc` never emits — tsdown owns builds.
- Import boundaries are ESLint-enforced (`.eslintrc.cjs`): `core/` may not import `adapters/`, `http/`, `app/`, `reporting/`, `drizzle-orm`, or frameworks. A context imports another only via its `index.ts`. Run `pnpm lint` after any cross-layer import change.
- Domain entities, DTOs and domain events are declared once in `@headless-lms/types`; a context's `model.ts`/`types.ts`/`events.ts` re-export them — never re-declare.
- Drizzle schema lives in `adapters/db/schema/<context>.ts`, repositories in `adapters/db/repositories/<context>.ts`. Never in `core/`.
- Org-scoped tables use a composite `(org_id, id)` PK with `org_id` → `organizations.id`.
- Never add AI-attribution trailers to commit messages.
- `packages/sdk/openapi.json` and `packages/sdk/src/generated/` are committed; regenerate with `pnpm gen:sdk` (needs a running database) whenever routes or contract schemas change.
- Baseline before any work: `pnpm test` → 49 files, 375 tests, 0 failures. Workspace packages must be built first (`pnpm --filter "./packages/**" --filter "./adapters/**" --filter "./plugins/**" build`) or vitest fails to resolve `@headless-lms/utils`.
- Name is `org_users` / `OrgUser` / `orgUserId`. Never `membership` in new code.

---

### Task 1: Widen `Role` with `student`

**Files:**
- Modify: `packages/types/src/organizations.ts:8`
- Modify: `packages/server/src/core/organizations/roles.ts`
- Test: `packages/server/src/core/organizations/roles.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Role = 'owner' | 'admin' | 'instructor' | 'student'`; `ROLES` includes `'student'`; `MATRIX.student = { consume_content: 'enrolled' }`.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/core/organizations/roles.test.ts`:

```ts
describe('student role', () => {
  it('is a known role', () => {
    expect(isRole('student')).toBe(true);
    expect(parseRole('student')).toBe('student');
  });

  it('may consume content only when enrolled', () => {
    expect(can('student', 'consume_content')).toBe('enrolled');
  });

  it('holds no management capability', () => {
    expect(can('student', 'manage_users')).toBeUndefined();
    expect(can('student', 'create_course')).toBeUndefined();
    expect(can('student', 'view_student_progress')).toBeUndefined();
  });
});
```

Check the existing imports at the top of that file and add `isRole`, `parseRole`, `can` if absent. If the module's accessor is not named `can`, use the existing exported accessor and keep these assertions.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/src/core/organizations/roles.test.ts`
Expected: FAIL — `parseRole('student')` throws `unknown role: student`.

- [ ] **Step 3: Widen the published type**

In `packages/types/src/organizations.ts` replace line 8:

```ts
/** Domain roles. The authorization matrix lives in core (roles.ts). */
export type Role = "owner" | "admin" | "instructor" | "student";
```

- [ ] **Step 4: Add the role to the matrix**

In `packages/server/src/core/organizations/roles.ts`:

```ts
export const ROLES = ['owner', 'admin', 'instructor', 'student'] as const satisfies readonly Role[];
```

and add to `MATRIX`:

```ts
  student: {
    consume_content: 'enrolled',
  },
```

- [ ] **Step 5: Rebuild types and run the tests**

Run: `pnpm --filter @headless-lms/types build && pnpm vitest run packages/server/src/core/organizations/roles.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck — the widened union surfaces exhaustive switches**

Run: `pnpm typecheck`
Fix every reported site by handling `'student'` explicitly. Known sites: `adapters/db/repositories/members.ts:14` (`ROLES` const — keep it staff-only there, see Task 7), `apps/admin/src/lib/roles.ts`, `apps/admin/src/lib/auth/server-session.ts:34`. Frontends keep their own staff-only `ServerRole` union — do not widen those.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/organizations.ts packages/server/src/core/organizations/roles.ts packages/server/src/core/organizations/roles.test.ts
git commit -m "feat(organizations): add student to the role union and authorization matrix"
```

---

### Task 2: Rename `memberships` → `org_users` (pure rename)

No behaviour change. Table, type, and every identifier.

**Files:**
- Modify: `packages/server/src/adapters/db/schema/organizations.ts:32-50,82-107`
- Modify: `packages/types/src/organizations.ts` (`Membership`, `MembershipId`, `AddMembershipInput`, `CourseAssignment.membershipId`, `AssignCourseInput.membershipId`)
- Modify: `packages/server/src/core/shared/id.ts:15`
- Modify: `packages/server/src/core/organizations/{model,types,ports,service,index}.ts`
- Modify: `packages/server/src/adapters/db/repositories/{organizations,members}.ts`
- Modify: `packages/server/src/adapters/auth/index.ts:156-182`
- Modify: `packages/server/src/http/mcp/principal.ts:33-41`
- Modify: `packages/server/src/http/scope.ts:44`
- Create: `packages/server/drizzle/0001_rename_memberships_to_org_users.sql`
- Test: `packages/server/src/core/organizations/service.test.ts`

**Interfaces:**
- Consumes: Task 1's widened `Role`.
- Produces: `OrgUser` (was `Membership`), `OrgUserId`, `AddOrgUserInput`, `CourseAssignment.orgUserId`, `AssignCourseInput.orgUserId`, `ID_PREFIXES.orgUser = 'orm'`, table `org_users`, service methods `addOrgUser`, `removeOrgUser`, `getOrgUserByUser`, `assignedCourseIds(orgId, orgUserId)`.

- [ ] **Step 1: Rename in the published types**

In `packages/types/src/organizations.ts`:

```ts
export interface OrgUser {
  readonly id: string;
  readonly orgId: string;
  /** The person this participation belongs to. */
  readonly userId: string;
  readonly role: Role;
  // Links to the better-auth member record.
  readonly externalId: string;
  readonly createdAt: Date;
}

export interface CourseAssignment {
  readonly id: string;
  readonly orgId: string;
  readonly orgUserId: string;
  readonly courseId: string;
  readonly createdAt: Date;
}

export type OrgUserId = string;

export interface AddOrgUserInput {
  orgExternalId: string;
  externalId: string;
  userId: string;
  role: string;
}

export interface AssignCourseInput {
  orgExternalId: string;
  orgUserId: string;
  courseId: string;
}
```

Delete `Membership`, `MembershipId`, `AddMembershipInput`.

- [ ] **Step 2: Rename the id prefix key**

In `packages/server/src/core/shared/id.ts` replace `membership: 'orm',` with `orgUser: 'orm',`. The prefix string is unchanged — existing ids stay valid.

Update `packages/server/src/core/shared/id.test.ts` if it names `membership`.

- [ ] **Step 3: Rename the table**

In `packages/server/src/adapters/db/schema/organizations.ts`:

```ts
export const orgUsers = pgTable(
  'org_users',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('orgUser')),

    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role', { enum: ['owner', 'admin', 'instructor', 'student'] }).notNull(),
    externalId: text('external_id').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.orgId, t.id] }) }),
);
```

and in `courseAssignments` rename `membershipId` → `orgUserId`, column `membership_id` → `org_user_id`, and the FK:

```ts
    orgUserId: text('org_user_id').notNull(),
    ...
    uniqueAssignment: unique().on(t.orgId, t.orgUserId, t.courseId),
    orgUserFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
```

Update the re-export in `packages/server/src/adapters/db/schema/index.ts`.

- [ ] **Step 4: Rename through core and adapters**

Mechanical rename across the files listed above:

| Old | New |
|---|---|
| `Membership` | `OrgUser` |
| `MembershipId` | `OrgUserId` |
| `AddMembershipInput` | `AddOrgUserInput` |
| `addMembership` | `addOrgUser` |
| `removeMembership` | `removeOrgUser` |
| `insertMembership` | `insertOrgUser` |
| `deleteMembershipByExternalId` | `deleteOrgUserByExternalId` |
| `getMembershipByUser` | `getOrgUserByUser` |
| `findMembershipByUser` | `findOrgUserByUser` |
| `membershipId` | `orgUserId` |
| `memberships` (table import) | `orgUsers` |

Do not rename `MembersRepository`, `MemberRecord`, `Member`, `listMembers`, `updateMemberRole`, `removeMember` — those are the member-management read surface, a different concept, and they stay.

- [ ] **Step 5: Generate the migration**

Run: `pnpm db:generate`

Drizzle emits a drop-and-create for a rename. Replace the generated SQL body with an in-place rename so data survives:

```sql
ALTER TABLE "memberships" RENAME TO "org_users";
ALTER TABLE "org_users" RENAME CONSTRAINT "memberships_org_id_organizations_id_fk" TO "org_users_org_id_organizations_id_fk";
ALTER TABLE "org_users" RENAME CONSTRAINT "memberships_user_id_users_id_fk" TO "org_users_user_id_users_id_fk";
ALTER TABLE "org_users" RENAME CONSTRAINT "memberships_external_id_unique" TO "org_users_external_id_unique";
ALTER TABLE "org_users" RENAME CONSTRAINT "memberships_org_id_id_pk" TO "org_users_org_id_id_pk";

ALTER TABLE "course_assignments" RENAME COLUMN "membership_id" TO "org_user_id";
ALTER TABLE "course_assignments" DROP CONSTRAINT IF EXISTS "course_assignments_org_id_membership_id_memberships_org_id_id_fk";
ALTER TABLE "course_assignments" ADD CONSTRAINT "course_assignments_org_id_org_user_id_org_users_org_id_id_fk"
  FOREIGN KEY ("org_id","org_user_id") REFERENCES "org_users"("org_id","id");
```

Verify the exact pre-existing constraint names first:

```bash
grep -n "memberships\|course_assignments" packages/server/drizzle/0000_baseline.sql
```

Use whatever names that file actually declares — the ones above are the expected defaults, not a guess to paste blind.

- [ ] **Step 6: Run the full suite**

Run: `pnpm --filter "./packages/**" --filter "./adapters/**" --filter "./plugins/**" build && pnpm test && pnpm typecheck && pnpm lint`
Expected: 375 tests pass, no type errors, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(organizations): rename memberships to org_users"
```

---

### Task 3: Add participation columns to `org_users`

Makes the row able to represent a pending participant and carry the person fields students used to hold.

**Files:**
- Modify: `packages/server/src/adapters/db/schema/organizations.ts`
- Modify: `packages/types/src/organizations.ts` (`OrgUser`)
- Create: `packages/server/drizzle/0002_org_users_participation_fields.sql`

**Interfaces:**
- Consumes: Task 2's `orgUsers` table and `OrgUser` type.
- Produces: `OrgUser` with `userId: string | null`, `externalId: string | null`, `email: string`, `firstName: string`, `lastName: string`, `updatedAt: Date`; uniques on `(org_id, email)` and `(org_id, user_id)`.

- [ ] **Step 1: Extend the type**

```ts
export interface OrgUser {
  readonly id: string;
  readonly orgId: string;
  /** The person this participation belongs to; NULL until the invite is claimed. */
  readonly userId: string | null;
  readonly role: Role;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  /** better-auth member record id — staff only; NULL for students. */
  readonly externalId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
```

- [ ] **Step 2: Extend the table**

```ts
export const orgUsers = pgTable(
  'org_users',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('orgUser')),
    // The person. NULL while the participant is pending (invited, not claimed).
    userId: text('user_id').references(() => users.id),
    role: text('role', { enum: ['owner', 'admin', 'instructor', 'student'] }).notNull(),
    email: text('email').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    // better-auth member record id. Staff only — students have no member row.
    externalId: text('external_id').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    emailUq: unique().on(t.orgId, t.email),
    userUq: unique().on(t.orgId, t.userId),
  }),
);
```

- [ ] **Step 3: Write the migration with backfill**

`packages/server/drizzle/0002_org_users_participation_fields.sql`:

```sql
ALTER TABLE "org_users" ADD COLUMN "email" text;
ALTER TABLE "org_users" ADD COLUMN "first_name" text;
ALTER TABLE "org_users" ADD COLUMN "last_name" text;
ALTER TABLE "org_users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "org_users" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "org_users" ALTER COLUMN "external_id" DROP NOT NULL;

-- Backfill the person fields from the linked users row. display_name splits on
-- the first space; a single-word name leaves last_name empty.
UPDATE "org_users" ou SET
  "email"      = u."email",
  "first_name" = split_part(u."display_name", ' ', 1),
  "last_name"  = COALESCE(NULLIF(substring(u."display_name" from position(' ' in u."display_name") + 1), u."display_name"), '')
FROM "users" u
WHERE u."id" = ou."user_id";

ALTER TABLE "org_users" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "org_users" ALTER COLUMN "first_name" SET NOT NULL;
ALTER TABLE "org_users" ALTER COLUMN "last_name" SET NOT NULL;

ALTER TABLE "org_users" ADD CONSTRAINT "org_users_org_id_email_unique" UNIQUE("org_id","email");
ALTER TABLE "org_users" ADD CONSTRAINT "org_users_org_id_user_id_unique" UNIQUE("org_id","user_id");
```

- [ ] **Step 4: Apply and verify**

Run: `pnpm db:migrate && pnpm typecheck`
Expected: migration applies; typecheck reports errors only where `OrgUser.userId`/`externalId` are now nullable — fix each by narrowing at the use site, never by casting.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(organizations): give org_users participation fields and a nullable person link"
```

---

### Task 4: Org-explicit participation lookup

Fixes the hard-coded single-membership assumption. This is the org-switcher enabler and is testable on its own.

**Files:**
- Modify: `packages/server/src/adapters/db/repositories/organizations.ts:236-246`
- Modify: `packages/server/src/core/organizations/ports.ts` (`OrganizationProvisioner`, `OrganizationsRepository`)
- Modify: `packages/server/src/core/organizations/service.ts:288-290`
- Modify: `packages/server/src/http/scope.ts:44-47`
- Modify: `packages/server/src/http/mcp/principal.ts:33`
- Test: `packages/server/src/http/scope.test.ts`

**Interfaces:**
- Consumes: Task 3's `OrgUser`.
- Produces: `OrganizationService.getOrgUser(orgId: string, userId: string): Promise<OrgUser | null>`; `OrganizationsRepository.findOrgUser(orgId, userId)`. `getOrgUserByUser(userId)` is deleted.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/http/scope.test.ts` — mirror the existing fake-container style in that file:

```ts
it('resolves the participation for the session active org, not an arbitrary one', async () => {
  const container = makeContainer({
    orgsByExternalId: { auth_org_b: { id: 'org_b', externalId: 'auth_org_b' } },
    users: { auth_usr_1: { id: 'usr_1' } },
    orgUsers: {
      'org_a:usr_1': { id: 'orm_a', orgId: 'org_a', userId: 'usr_1', role: 'owner' },
      'org_b:usr_1': { id: 'orm_b', orgId: 'org_b', userId: 'usr_1', role: 'instructor' },
    },
  });
  const scope = await resolveScope(container, req({ authUserId: 'auth_usr_1', orgId: 'auth_org_b' }));
  expect(scope.orgId).toBe('org_b');
  expect(scope.orgUserId).toBe('orm_b');
  expect(scope.role).toBe('instructor');
});

it('rejects a session whose user has no participation in the active org', async () => {
  const container = makeContainer({
    orgsByExternalId: { auth_org_b: { id: 'org_b', externalId: 'auth_org_b' } },
    users: { auth_usr_1: { id: 'usr_1' } },
    orgUsers: { 'org_a:usr_1': { id: 'orm_a', orgId: 'org_a', userId: 'usr_1', role: 'owner' } },
  });
  await expect(resolveScope(container, req({ authUserId: 'auth_usr_1', orgId: 'auth_org_b' }))).rejects.toBeInstanceOf(NoActiveOrgError);
});
```

Extend the file's existing `makeContainer` helper with an `orgUsers` map keyed `` `${orgId}:${userId}` `` and a `getOrgUser(orgId, userId)` that reads it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/server/src/http/scope.test.ts`
Expected: FAIL — `container.organizations.getOrgUser is not a function`.

- [ ] **Step 3: Replace the repository method**

In `packages/server/src/adapters/db/repositories/organizations.ts`, delete `findOrgUserByUser` and add:

```ts
  async findOrgUser(orgId: string, userId: string): Promise<OrgUser | null> {
    const [row] = await this.db
      .select()
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.userId, userId)))
      .limit(1);
    return row ? { ...row, role: parseRole(row.role) } : null;
  }
```

`(org_id, user_id)` is unique (Task 3), so this is a point lookup.

- [ ] **Step 4: Thread it through the port and service**

`core/organizations/ports.ts` — in `OrganizationProvisioner` replace `getMembershipByUser` with:

```ts
  /** The caller's participation in a specific org. Null when they hold none. */
  getOrgUser(orgId: string, userId: string): Promise<OrgUser | null>;
```

and in `OrganizationsRepository` replace `findOrgUserByUser` with `findOrgUser(orgId: string, userId: string): Promise<OrgUser | null>;`.

`core/organizations/service.ts`:

```ts
  async getOrgUser(orgId: string, userId: string): Promise<OrgUser | null> {
    return this.repo.findOrgUser(orgId, userId);
  }
```

- [ ] **Step 5: Use it in the two callers**

`http/scope.ts` — replace lines 44-49 and widen `OrgScope`:

```ts
export interface OrgScope {
  /** Domain `organizations.id` for the session's active org. */
  orgId: string;
  /** Domain `users.id` of the acting person. */
  userId: string;
  /** Domain `org_users.id` — the acting participation in this org. */
  orgUserId: string;
  /** The acting role in this org. */
  role: Role;
  /** Better-auth organization id (for writes that go through the auth provider). */
  authOrgId: string;
}
```

```ts
  const orgUser = await container.organizations.getOrgUser(org.id, user.id);
  if (!orgUser || orgUser.role === 'student') {
    throw new NoActiveOrgError('not a staff member of the active organization');
  }
  container.requestContext.set({ orgId: org.id });
  return { orgId: org.id, userId: user.id, orgUserId: orgUser.id, role: orgUser.role, authOrgId };
```

The `role === 'student'` guard replaces the comment-documented hole at `http/scope.ts:6-11`: students now hold an `org_users` row, so mere existence is no longer proof of staff.

`http/mcp/principal.ts` — the token carries no active org, so resolve the org from the participation. Replace lines 33-41:

```ts
  const orgUser = await container.organizations.getSoleOrgUser(user.id);
  if (!orgUser) {
    throw new PrincipalError('user has no unambiguous org participation', 403);
  }
  const assignedCourseIds = await container.organizations.assignedCourseIds(
    orgUser.orgId,
    orgUser.id,
  );
```

and update the returned principal to `{ studentId: orgUser.id, orgId: orgUser.orgId, role: parseRole(orgUser.role), assignedCourseIds, scopes }`.

Add the supporting repository method:

```ts
  async findSoleOrgUser(userId: string): Promise<OrgUser | null> {
    const rows = await this.db
      .select()
      .from(orgUsers)
      .where(eq(orgUsers.userId, userId))
      .limit(2);
    const [row] = rows;
    return rows.length === 1 && row ? { ...row, role: parseRole(row.role) } : null;
  }
```

with `getSoleOrgUser(userId)` on the service and both port interfaces. Returning null on ambiguity is deliberate: an MCP token that could act in two orgs must not silently pick one.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run packages/server/src/http/scope.test.ts packages/server/src/http/mcp`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix(organizations): resolve org participation by active org instead of first membership"
```

---

### Task 5: Move students into `org_users`

**Files:**
- Modify: `packages/server/src/adapters/db/schema/identity.ts` — delete `students`
- Modify: `packages/types/src/identity.ts` — delete `Student`, retype events
- Modify: `packages/server/src/core/identity/{model,types,ports,service,events,index}.ts`
- Modify: `packages/server/src/adapters/db/repositories/identity.ts`
- Modify: `packages/server/src/core/identity/service.test.ts`
- Create: `packages/server/drizzle/0003_students_into_org_users.sql`

**Interfaces:**
- Consumes: Task 3's `org_users` shape, Task 4's `findOrgUser`.
- Produces: `IdentityService` loses every `*Student*` method. `OrganizationService` gains `createParticipant(input)`, `getParticipant(orgId, id)`, `deleteParticipant(orgId, id)`, `hasPendingParticipant(orgId, email)`, `claimParticipant(orgId, email, invitationId, userId)`. Domain events keep their `student.*` names and now carry `OrgUser`.

- [ ] **Step 1: Write the failing migration guard test**

Create `packages/server/src/adapters/db/schema/org-users.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { orgUsers } from './organizations.js';

describe('org_users', () => {
  it('carries the participation fields students used to own', () => {
    const cols = Object.keys(orgUsers);
    for (const c of ['orgId', 'id', 'userId', 'role', 'email', 'firstName', 'lastName']) {
      expect(cols).toContain(c);
    }
  });

  it('no longer exports a students table', async () => {
    const identity = await import('./identity.js');
    expect('students' in identity).toBe(false);
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run packages/server/src/adapters/db/schema/org-users.test.ts`
Expected: FAIL on the second assertion — `students` is still exported.

- [ ] **Step 3: Drop the students table from the schema**

Delete the `students` export from `packages/server/src/adapters/db/schema/identity.ts`, leaving only `users`. Remove it from `schema/index.ts` re-exports.

- [ ] **Step 4: Retype the identity events**

In `packages/types/src/identity.ts`: delete `Student`, `StudentId`, `RegisterStudentInput`, `CreateStudentInput`. Keep the event names (consumers — Slack formatters, automations catalog — key off the `type` string) but carry the participation row:

```ts
import type { OrgUser } from "./organizations.js";

/** A participant row was created (admin creation or portal registration). */
export interface StudentCreated extends DomainEvent {
  type: "student.created";
  student: OrgUser;
}

/** A participant row was deleted; carries the last known state. */
export interface StudentDeleted extends DomainEvent {
  type: "student.deleted";
  student: OrgUser;
}

/** A pending participant was claimed by an auth account (invite acceptance). */
export interface StudentLinked extends DomainEvent {
  type: "student.linked";
  email: string;
  invitationId: string;
  userExternalId: string;
}
```

Move `CreateStudentInput` to `packages/types/src/organizations.ts` as:

```ts
export interface CreateParticipantInput {
  orgId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}
```

- [ ] **Step 5: Move the student use-cases onto the organizations service**

Delete from `core/identity/{ports,service}.ts`: `StudentProvisioner`, `registerStudent`, `getStudentByExternalId`, `studentOrgExternalId`, `createStudent`, `getStudentById`, `deleteStudent`, `hasPendingStudent`, `linkPendingStudent`, and the matching `IdentityRepository` methods. `IdentityService` keeps only `registerUser` and `getUserByExternalId`.

Add to `core/organizations/service.ts` (the participation owner), preserving the transactional-outbox shape the identity service used:

```ts
  async createParticipant(input: CreateParticipantInput): Promise<OrgUser> {
    const existing = await this.repo.findOrgUserByEmail(input.orgId, input.email);
    if (existing) {
      throw new ConflictError('A participant with this email already exists');
    }
    const participant = await this.uow.run(async ({ organizations, outbox }) => {
      const created = await organizations.insertPendingOrgUser(input);
      await outbox.append([{ type: 'student.created', orgId: created.orgId, student: created }]);
      return created;
    });
    this.logger.info('participant created', { orgId: input.orgId, orgUserId: participant.id });
    return participant;
  }

  async getParticipant(orgId: string, id: string): Promise<OrgUser | null> {
    return this.repo.findOrgUserById(orgId, id);
  }

  async deleteParticipant(orgId: string, id: string): Promise<void> {
    await this.uow.run(async ({ organizations, outbox }) => {
      const participant = await organizations.findOrgUserById(orgId, id);
      if (!participant) {
        throw new NotFoundError('Participant', id);
      }
      const ok = await organizations.deleteOrgUser(orgId, id);
      if (!ok) {
        throw new NotFoundError('Participant', id);
      }
      await outbox.append([{ type: 'student.deleted', orgId, student: participant }]);
    });
    this.logger.info('participant deleted', { orgId, orgUserId: id });
  }

  async hasPendingParticipant(orgId: string, email: string): Promise<boolean> {
    const row = await this.repo.findOrgUserByEmail(orgId, email);
    return row !== null && row.userId === null;
  }

  async claimParticipant(
    orgId: string,
    email: string,
    invitationId: string,
    userId: string,
    userExternalId: string,
  ): Promise<boolean> {
    const claimed = await this.uow.run(async ({ organizations, outbox }) => {
      const count = await organizations.claimOrgUser(orgId, email, userId);
      if (count > 0) {
        await outbox.append([
          { type: 'student.linked', orgId, email, invitationId, userExternalId },
        ]);
      }
      return count > 0;
    });
    return claimed;
  }
```

- [ ] **Step 6: Implement the repository methods**

In `adapters/db/repositories/organizations.ts`, port these over from `repositories/identity.ts:99-160`, swapping table and pending marker:

```ts
  async findOrgUserByEmail(orgId: string, email: string): Promise<OrgUser | null> {
    const [row] = await this.db
      .select()
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.email, email)))
      .limit(1);
    return row ? { ...row, role: parseRole(row.role) } : null;
  }

  async findOrgUserById(orgId: string, id: string): Promise<OrgUser | null> {
    const [row] = await this.db
      .select()
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.id, id)))
      .limit(1);
    return row ? { ...row, role: parseRole(row.role) } : null;
  }

  async insertPendingOrgUser(input: CreateParticipantInput): Promise<OrgUser> {
    try {
      const [row] = await this.db
        .insert(orgUsers)
        .values({
          orgId: input.orgId,
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role,
        })
        .returning();
      if (!row) {
        throw new Error('failed to insert org user');
      }
      return { ...row, role: parseRole(row.role) };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('A participant with this email already exists');
      }
      throw err;
    }
  }

  async deleteOrgUser(orgId: string, id: string): Promise<boolean> {
    await this.db
      .delete(progressRecords)
      .where(and(eq(progressRecords.orgId, orgId), eq(progressRecords.orgUserId, id)));
    const rows = await this.db
      .delete(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.id, id)))
      .returning({ id: orgUsers.id });
    return rows.length > 0;
  }

  async claimOrgUser(orgId: string, email: string, userId: string): Promise<number> {
    const rows = await this.db
      .update(orgUsers)
      .set({ userId })
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.email, email), isNull(orgUsers.userId)))
      .returning({ id: orgUsers.id });
    return rows.length;
  }
```

Move `isUniqueViolation` (currently `repositories/identity.ts:20-28`) into a shared helper at `adapters/db/repositories/pg-errors.ts` and import it from both files rather than duplicating it.

- [ ] **Step 7: Write the data migration**

`packages/server/drizzle/0003_students_into_org_users.sql`:

```sql
-- Fail loudly if a human is both staff and a student in the same org: the
-- (org_id, email) unique on org_users cannot hold both, and silently dropping
-- one would lose entitlements.
DO $$
DECLARE clash text;
BEGIN
  SELECT string_agg(s."org_id" || ':' || s."email", ', ')
    INTO clash
    FROM "students" s
    JOIN "org_users" ou ON ou."org_id" = s."org_id" AND lower(ou."email") = lower(s."email");
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'cannot migrate: these students collide with existing org_users on (org_id, email): %', clash;
  END IF;
END $$;

-- Preserve students.id as org_users.id so entitlements/progress keep resolving.
INSERT INTO "org_users" ("org_id","id","user_id","role","email","first_name","last_name","external_id","created_at","updated_at")
SELECT s."org_id", s."id", u."id", 'student', s."email", s."first_name", s."last_name", NULL, s."created_at", s."updated_at"
FROM "students" s
LEFT JOIN "users" u ON u."external_id" = s."external_id";

DROP TABLE "students";
```

The `LEFT JOIN` yields NULL `user_id` for pending students — exactly the pending marker.

- [ ] **Step 8: Update the identity service tests**

`core/identity/service.test.ts` keeps only the `registerUser` / `getUserByExternalId` cases. Move the student cases to `core/organizations/service.test.ts`, renaming to the participant vocabulary and swapping the pending marker from `externalId === null` to `userId === null`.

- [ ] **Step 9: Run and commit**

Run: `pnpm db:migrate && pnpm --filter "./packages/**" build && pnpm test && pnpm typecheck && pnpm lint`

```bash
git add -A
git commit -m "refactor(identity): fold students into org_users as role=student participants"
```

---

### Task 6: Retarget the dependent foreign keys

**Files:**
- Modify: `packages/server/src/adapters/db/schema/entitlements.ts:23,40-47`
- Modify: `packages/server/src/adapters/db/schema/progress.ts:20,35`
- Modify: `packages/types/src/{entitlements,progress}.ts`
- Modify: `packages/server/src/core/{entitlements,progress}/*` + their `service.test.ts`
- Modify: `packages/server/src/adapters/db/repositories/{entitlements,progress,learn,dashboard}.ts`
- Create: `packages/server/drizzle/0004_retarget_participant_fks.sql`

**Interfaces:**
- Consumes: Task 5's `org_users` as the sole participant table.
- Produces: `Entitlement.orgUserId`, `ProgressRecord.orgUserId`; `progress_records` gains a composite FK it never had.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/adapters/db/schema/progress.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { progressRecords } from './progress.js';

describe('progress_records', () => {
  it('references the participant by composite foreign key', () => {
    const fks = getTableConfig(progressRecords).foreignKeys;
    const ref = fks.find((fk) => fk.reference().foreignTable);
    expect(ref).toBeDefined();
    const cols = ref!.reference().columns.map((c) => c.name);
    expect(cols).toEqual(['org_id', 'org_user_id']);
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run packages/server/src/adapters/db/schema/progress.test.ts`
Expected: FAIL — `progress_records` declares no foreign keys.

- [ ] **Step 3: Rename the columns and add the missing FK**

`schema/entitlements.ts`: `studentId: text('student_id')` → `orgUserId: text('org_user_id')`; the composite FK's `columns` → `[t.orgId, t.orgUserId]`, `foreignColumns` → `[orgUsers.orgId, orgUsers.id]`; the unique → `.on(t.orgId, t.orgUserId, t.contentId)`.

`schema/progress.ts`: `studentId` → `orgUserId` / `org_user_id`; the unique → `.on(t.orgId, t.orgUserId, t.targetType, t.targetId)`; add:

```ts
    orgUserFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
```

The comment at `repositories/identity.ts:143-145` ("progress_records carries no student FK — denormalized by design") is now stale; the explicit delete in `deleteOrgUser` stays as an ordering guarantee, but update the comment to say the FK exists and the delete sequences around it.

- [ ] **Step 4: Rename through types, core, repositories**

`studentId` → `orgUserId` across `packages/types/src/{entitlements,progress}.ts`, `core/entitlements/*`, `core/progress/*`, and `adapters/db/repositories/{entitlements,progress,learn,dashboard}.ts`. The `GrantEntitlementInput.studentId` field renames too — this is an API-visible change, handled in Task 9.

- [ ] **Step 5: Write the migration**

```sql
ALTER TABLE "entitlements" RENAME COLUMN "student_id" TO "org_user_id";
ALTER TABLE "entitlements" DROP CONSTRAINT IF EXISTS "entitlements_org_id_student_id_students_org_id_id_fk";
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_org_id_org_user_id_org_users_org_id_id_fk"
  FOREIGN KEY ("org_id","org_user_id") REFERENCES "org_users"("org_id","id");

ALTER TABLE "progress_records" RENAME COLUMN "student_id" TO "org_user_id";
ALTER TABLE "progress_records" ADD CONSTRAINT "progress_records_org_id_org_user_id_org_users_org_id_id_fk"
  FOREIGN KEY ("org_id","org_user_id") REFERENCES "org_users"("org_id","id");
```

Confirm the dropped constraint's real name against `0000_baseline.sql` before running.

- [ ] **Step 6: Run and commit**

Run: `pnpm db:migrate && pnpm test && pnpm typecheck`

```bash
git add -A
git commit -m "refactor(entitlements,progress): retarget participant foreign keys to org_users"
```

---

### Task 7: Keep students out of the staff member list

With one table, every staff query is now a leak site.

**Files:**
- Modify: `packages/server/src/adapters/db/repositories/members.ts:36-97`
- Modify: `packages/server/src/reporting/students/{ports,service}.ts`
- Modify: `packages/server/src/adapters/db/repositories/students.ts`
- Test: `packages/server/src/core/organizations/service.test.ts`

**Interfaces:**
- Consumes: Task 5's unified table.
- Produces: `DrizzleMembersRepository` returns staff only; `DrizzleStudentsRepository` returns `role = 'student'` only.

- [ ] **Step 1: Write the failing test**

In `packages/server/src/core/organizations/service.test.ts`, against the in-memory members repo fake:

```ts
it('omits student participants from the member list', async () => {
  const svc = makeService({
    orgUsers: [
      { id: 'orm_1', orgId: 'org_1', role: 'admin', email: 'a@x.com', firstName: 'A', lastName: 'One' },
      { id: 'orm_2', orgId: 'org_1', role: 'student', email: 's@x.com', firstName: 'S', lastName: 'Two' },
    ],
  });
  const page = await svc.listMembers('org_1', { page: 1, pageSize: 20 });
  expect(page.rows.map((r) => r.email)).toEqual(['a@x.com']);
});
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run packages/server/src/core/organizations/service.test.ts -t "omits student"`
Expected: FAIL — both rows returned.

- [ ] **Step 3: Filter the staff read**

`adapters/db/repositories/members.ts` — in `loadAll`, the participation query becomes:

```ts
    const memberRows = await this.db
      .select({
        id: orgUsers.id,
        name: sql<string>`${orgUsers.firstName} || ' ' || ${orgUsers.lastName}`,
        email: orgUsers.email,
        image: user.image,
        role: orgUsers.role,
        joinedAt: orgUsers.createdAt,
        memberExternalId: orgUsers.externalId,
      })
      .from(orgUsers)
      .leftJoin(users, eq(users.id, orgUsers.userId))
      .leftJoin(user, eq(user.id, users.externalId))
      .where(and(eq(orgUsers.orgId, orgId), ne(orgUsers.role, 'student')));
```

The join to `users` becomes a LEFT join — a pending staff participant has no person row yet. Keep `const ROLES: Role[] = ['owner', 'admin', 'instructor']` in this file: it is the staff-only narrowing for the member surface, and `roleOf` falling back to `'instructor'` stays correct because students are already excluded.

Status derives from the claim state rather than the table it came from:

```ts
      status: m.userId ? 'active' : 'invited',
```

- [ ] **Step 4: Filter the student read**

`adapters/db/repositories/students.ts` — swap `students` for `orgUsers` and add `eq(orgUsers.role, 'student')` to every `where`. `externalId IS NULL` as the pending marker becomes `userId IS NULL`.

- [ ] **Step 5: Run and commit**

Run: `pnpm vitest run packages/server/src/core/organizations packages/server/src/reporting`

```bash
git add -A
git commit -m "fix(organizations): exclude student participants from the staff member list"
```

---

### Task 8: Unify the invitation flow

**Files:**
- Modify: `packages/server/src/core/organizations/service.ts:132-233`
- Modify: `packages/server/src/core/organizations/ports.ts` (drop `StudentLinker`)
- Modify: `packages/server/src/app/container.ts`
- Test: `packages/server/src/core/organizations/service.test.ts`

**Interfaces:**
- Consumes: Task 5's `createParticipant` / `claimParticipant`.
- Produces: `createInvite` creates the pending participant for **every** role; `acceptInvite` claims it for every role and additionally grants the better-auth membership for staff roles.

- [ ] **Step 1: Write the failing test**

```ts
it('creates a pending participant for a staff invite', async () => {
  const svc = makeService();
  await svc.createInvite({ orgId: 'org_1', email: 'new@x.com', role: 'instructor', inviterUserId: 'usr_1' });
  const pending = await svc.hasPendingParticipant('org_1', 'new@x.com');
  expect(pending).toBe(true);
});

it('claims the pending participant on acceptance regardless of role', async () => {
  const svc = makeService();
  await svc.createInvite({ orgId: 'org_1', email: 'new@x.com', role: 'instructor', inviterUserId: 'usr_1' });
  const result = await svc.acceptInvite({ token: lastToken(), userExternalId: 'auth_usr_9', email: 'new@x.com' });
  expect(result?.role).toBe('instructor');
  expect(await svc.hasPendingParticipant('org_1', 'new@x.com')).toBe(false);
});
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run packages/server/src/core/organizations/service.test.ts -t "pending participant"`
Expected: FAIL — staff invites create no participation row.

- [ ] **Step 3: Collapse the role branch in `createInvite`**

Replace lines 133-144:

```ts
    const { orgId, email, role, inviterUserId } = input;
    const existing = await this.repo.findOrgUserByEmail(orgId, email);
    if (existing && existing.userId !== null) {
      this.logger.warn('invite rejected: already a participant', { orgId, role });
      throw new OrganizationRuleError('This email already belongs to this organization.');
    }
    if (!existing) {
      await this.createParticipant({ orgId, email, role, firstName: email, lastName: '' });
    }
```

An admin-created student already has a row with real names, so the `!existing` guard preserves them; a staff invite has none, so the email stands in until acceptance fills it from the better-auth account.

- [ ] **Step 4: Collapse the role branch in `acceptInvite`**

Replace lines 198-214:

```ts
    const user = await this.users.getUserByExternalId(input.userExternalId);
    if (!user) {
      this.logger.warn('invite accept refused: no domain user for the account', {
        orgId: invitation.orgId,
        invitationId: invitation.id,
      });
      return null;
    }
    const claimed = await this.claimParticipant(
      invitation.orgId,
      invitation.email,
      invitation.id,
      user.id,
      input.userExternalId,
    );
    if (!claimed) {
      this.logger.warn('invite accept refused: no pending participant', {
        orgId: invitation.orgId,
        invitationId: invitation.id,
      });
      return null;
    }
    if (invitation.role !== STUDENT_ROLE) {
      // Staff also need better-auth's member record; its afterAddMember hook
      // stamps external_id onto the participation row we just claimed.
      await this.orgAdmin().grantMembership(org.externalId, input.userExternalId, invitation.role);
    }
```

Replace the `StudentLinker` constructor dependency with a `UserResolver` (`getUserByExternalId`), satisfied by `IdentityService`. Update `app/container.ts` wiring accordingly.

- [ ] **Step 5: Run and commit**

Run: `pnpm vitest run packages/server/src/core/organizations`

```bash
git add -A
git commit -m "refactor(organizations): one invitation flow for staff and student participants"
```

---

### Task 9: Auth adapter hooks and session stamping

**Files:**
- Modify: `packages/server/src/adapters/auth/index.ts:148-182,242-256`
- Modify: `packages/server/src/adapters/auth/org-admin.ts`
- Test: `packages/server/src/app/container.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 5, 8.
- Produces: `afterAddMember` stamps `external_id` onto an existing participation row (insert only when absent); the session hook stamps the org from any sole participation, not only a student one.

- [ ] **Step 1: Make `afterAddMember` idempotent against a claimed row**

`addOrgUser` on the service currently always inserts. Replace `insertOrgUser` in `adapters/db/repositories/organizations.ts` with an upsert keyed on `(org_id, email)`:

```ts
  async upsertOrgUser(orgId: string, input: AddOrgUserInput): Promise<OrgUser> {
    const [row] = await this.db
      .update(orgUsers)
      .set({ externalId: input.externalId, role: normalizeRole(input.role), userId: input.userId })
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.userId, input.userId)))
      .returning();
    if (row) {
      return { ...row, role: parseRole(row.role) };
    }
    const [inserted] = await this.db
      .insert(orgUsers)
      .values({
        orgId,
        userId: input.userId,
        role: normalizeRole(input.role),
        externalId: input.externalId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
      })
      .onConflictDoNothing({ target: orgUsers.externalId })
      .returning();
    if (inserted) {
      return { ...inserted, role: parseRole(inserted.role) };
    }
    const [existing] = await this.db
      .select()
      .from(orgUsers)
      .where(eq(orgUsers.externalId, input.externalId))
      .limit(1);
    if (!existing) {
      throw new Error('failed to upsert org user');
    }
    return { ...existing, role: parseRole(existing.role) };
  }
```

`AddOrgUserInput` gains `email`, `firstName`, `lastName` — the org-creation path (`afterCreateOrganization`) has no prior row, so it must supply them.

- [ ] **Step 2: Supply the person fields from the hooks**

In `adapters/auth/index.ts`, both `afterCreateOrganization` and `afterAddMember` already receive better-auth's `user`. Pass its fields through:

```ts
          afterCreateOrganization: async ({ organization: org, member, user }) => {
            const owner = await requireUser(user.id);
            await opts.organizations.createOrg({
              externalId: org.id,
              name: org.name,
              slug: org.slug,
              ownerId: owner.id,
            });
            await opts.organizations.addOrgUser({
              orgExternalId: org.id,
              externalId: member.id,
              userId: owner.id,
              role: member.role,
              email: owner.email,
              firstName: splitName(owner.displayName).first,
              lastName: splitName(owner.displayName).last,
            });
          },
```

Add `splitName` to `core/shared/name.ts` — the same first-space split the Task 3 migration performs, so backfilled and runtime rows agree:

```ts
/** Splits a display name on the first space. A single word leaves `last` empty. */
export function splitName(displayName: string): { first: string; last: string } {
  const trimmed = displayName.trim();
  const i = trimmed.indexOf(' ');
  return i === -1
    ? { first: trimmed, last: '' }
    : { first: trimmed.slice(0, i), last: trimmed.slice(i + 1) };
}
```

with `core/shared/name.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { splitName } from './name.js';

describe('splitName', () => {
  it('splits on the first space', () => {
    expect(splitName('Ada Lovelace')).toEqual({ first: 'Ada', last: 'Lovelace' });
  });
  it('keeps compound surnames intact', () => {
    expect(splitName('Ada van der Berg')).toEqual({ first: 'Ada', last: 'van der Berg' });
  });
  it('leaves last empty for a single word', () => {
    expect(splitName('Ada')).toEqual({ first: 'Ada', last: '' });
  });
});
```

Apply the same treatment to `afterAddMember`.

- [ ] **Step 3: Generalize the session org stamp**

`adapters/auth/index.ts:242-256` — replace `studentOrgExternalId` with the role-agnostic sole-participation lookup:

```ts
          before: async (session) => {
            // Stamp the session's active org when the login participates in
            // exactly one org — students always, and staff who belong to a
            // single org. Ambiguous (multi-org) logins are left untouched: the
            // organization plugin's active-org selection owns that case, which
            // is what lets a staff user switch orgs.
            const orgExternalId = await opts.organizations.soleOrgExternalId(session.userId);
            if (!orgExternalId) {
              return;
            }
            return { data: { ...session, activeOrganizationId: orgExternalId } };
          },
```

Implement `soleOrgExternalId(userExternalId)` on the organizations service, backed by:

```ts
  async findSoleOrgExternalId(userExternalId: string): Promise<string | null> {
    const rows = await this.db
      .select({ orgExternalId: organizations.externalId })
      .from(orgUsers)
      .innerJoin(organizations, eq(organizations.id, orgUsers.orgId))
      .innerJoin(users, eq(users.id, orgUsers.userId))
      .where(eq(users.externalId, userExternalId))
      .limit(2);
    return rows.length === 1 ? (rows[0]?.orgExternalId ?? null) : null;
  }
```

- [ ] **Step 4: Run and commit**

Run: `pnpm vitest run packages/server/src/app packages/server/src/core/shared && pnpm typecheck`

```bash
git add -A
git commit -m "refactor(auth): stamp sole-org sessions and reconcile member hooks with claimed participants"
```

---

### Task 10: HTTP routes, API contract, SDK

**Files:**
- Modify: `packages/api-contract/src/{students,entitlements,dashboard,learn,invites}.ts`
- Modify: `packages/server/src/http/routes/{students,entitlements,organizations,learn}.ts`
- Modify: `packages/server/src/http/student-scope.ts`
- Modify: `packages/server/src/reporting/students/*`, `reporting/learn/*`, `reporting/dashboard/model.ts`
- Regenerate: `packages/sdk/openapi.json`, `packages/sdk/src/generated/`

**Interfaces:**
- Consumes: Tasks 5-8.
- Produces: `studentId` → `orgUserId` in every request/response schema; `resolveStudentScope` returns `{ orgUserId, orgId, org }`.

- [ ] **Step 1: Rename in the contract**

In `packages/api-contract/src/entitlements.ts`, `GrantEntitlement.studentId` → `orgUserId`; `Entitlement.studentId` → `orgUserId`. Same for `students.ts` (`Student.id` stays — it is the participation id), `dashboard.ts`, `learn.ts`. Do not rename the `Students` OpenAPI tag or the `/students` path: the resource is still students to API consumers.

- [ ] **Step 2: Rewire the student scope**

`http/student-scope.ts` — resolve person then participation:

```ts
export interface StudentScope {
  /** Domain `org_users.id` for the session's person in the portal org. */
  orgUserId: string;
  orgId: string;
  org: Organization;
}
```

```ts
  const user = await container.identity.getUserByExternalId(authUser.id);
  if (!user) {
    throw new NoStudentError('no domain user for the current session');
  }
  const participant = await container.organizations.getOrgUser(org.id, user.id);
  if (!participant || participant.role !== 'student') {
    throw new NoStudentError('no student participation for the current session');
  }
  return { orgUserId: participant.id, orgId: org.id, org };
```

- [ ] **Step 3: Update routes and reporting**

Rename `studentId` → `orgUserId` through `http/routes/*` and `reporting/*`, matching the contract. `reporting/students/service.ts` composes `firstName`/`lastName` from the participation row rather than a student row.

- [ ] **Step 4: Regenerate the SDK**

Run (database must be up):

```bash
pnpm gen:sdk
```

Expected: `packages/sdk/openapi.json` and `packages/sdk/src/generated/` change; `Students`, `Entitlements`, `Dashboard` classes keep their names with renamed fields.

- [ ] **Step 5: Run and commit**

Run: `pnpm test && pnpm typecheck && pnpm lint`

```bash
git add -A
git commit -m "refactor(http): expose participants as org_user_id across routes, contract and sdk"
```

---

### Task 11: Frontends

**Files:**
- Modify: `apps/admin/src/app/(dashboard)/students/{page.tsx,actions.ts,students-table.tsx,_components/*,[studentId]/*}`
- Modify: `apps/admin/src/app/(dashboard)/entitlements/{page.tsx,actions.ts,entitlements-columns.tsx,entitlements-table.tsx,_components/grant-access-sheet.tsx}`
- Modify: `apps/admin/src/app/(dashboard)/settings/team/{members-table.tsx,_components/invite-sheet.tsx}`
- Modify: `apps/admin/src/lib/{api/types.ts,query-keys.ts,roles.ts}`
- Modify: `apps/student/src/lib/{api/server.ts,api/shared.ts,progress-reporter.ts,auth/server-session.ts}`, `apps/student/src/proxy.ts`

**Interfaces:**
- Consumes: Task 10's regenerated SDK.
- Produces: compiling frontends against the renamed fields.

- [ ] **Step 1: Typecheck to enumerate the breakage**

Run: `pnpm --filter admin typecheck && pnpm --filter student typecheck`
Expected: errors at every `studentId` / `membershipId` field access.

- [ ] **Step 2: Fix each reported site**

Rename the field accesses. Do not rename route segments (`/students/[studentId]`), user-facing copy, or query-key namespaces — those are product vocabulary, unchanged. Keep `apps/admin/src/lib/auth/server-session.ts`'s `ServerRole` union staff-only (`owner|admin|instructor`): a student role reaching the dashboard resolver must still fail the `toRole` check and land in `denied`.

- [ ] **Step 3: Verify**

Run: `pnpm --filter admin typecheck && pnpm --filter student typecheck && pnpm --filter admin build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(admin,student): consume the renamed participant fields"
```

---

### Task 12: Plugins, email templates, docs

**Files:**
- Modify: `plugins/slack/src/notifications/{formatters,schema}.ts`, `plugins/slack/src/actions/post-to-channel.ts`
- Modify: `adapters/email-templates/src/emails/{student-invite,access-granted}.tsx`, `src/index.tsx`
- Modify: `packages/server/src/core/automations/{actions,catalog}.ts`
- Modify: `docs/domain/{identity,organizations,entitlements}.md`, `docs/architecture.md`, `AGENTS.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: event consumers compile against `OrgUser`-carrying events; docs describe the unified model.

- [ ] **Step 1: Update the event consumers**

`plugins/slack/src/notifications/formatters.ts` reads `event.student.firstName` / `lastName` / `email` — all still present on `OrgUser`, so the change is the imported type only. Verify against `formatters.test.ts` rather than assuming.

- [ ] **Step 2: Update the domain docs**

`docs/domain/identity.md` — describe `users` as the global person and point participation at the organizations context. `docs/domain/organizations.md` — `org_users` is the participation table carrying the role, including `student`; pending participants have `user_id IS NULL`. `docs/domain/entitlements.md` — grants target a participant. Keep these in domain vocabulary with no implementation detail.

`docs/architecture.md` and `AGENTS.md` — replace the multi-tenancy paragraph's description of `students` as an org-scoped identity with the person/participation split, and note that `org_users` is the single actor FK target.

- [ ] **Step 3: Full verification**

Run:

```bash
pnpm --filter "./packages/**" --filter "./adapters/**" --filter "./plugins/**" build
pnpm test
pnpm typecheck
pnpm lint
```

Expected: all green, test count ≥ 375.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: describe the unified person / org participation model"
```

---

## Manual verification

Run against a live stack (`pnpm dev`) after Task 12:

- [ ] Staff signup → create org → dashboard loads, role `owner`.
- [ ] Invite an instructor → accept from a second account → they land in the dashboard as `instructor`, and appear once in Settings → Team.
- [ ] Admin creates a student → student appears in Students, absent from Settings → Team.
- [ ] Grant an entitlement to that pending student → invite → accept → the student portal shows the granted course.
- [ ] A human who is `owner` in org A and `instructor` in org B: switching the active org changes the resolved role, and each org's data stays isolated.
- [ ] Student login → portal only; hitting an admin route returns 401/redirect, not a dashboard.
