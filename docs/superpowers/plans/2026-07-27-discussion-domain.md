# Discussion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `discussion` bounded context — comments on an activity, replies, reactions, reports, moderation and review — end to end from domain types through HTTP routes and the generated SDK to the comment thread in the student player and the moderation tab in the admin dashboard.

**Architecture:** A ninth core context at `packages/server/src/core/discussion/`, following the same file contract as every other context (`service.ts`, `model.ts`, `types.ts`, `events.ts`, `ports.ts`, `index.ts`, `service.test.ts`). Domain entities live in `@headless-lms/types`; Drizzle tables in `adapters/db/schema/discussion.ts`; the repository in `adapters/db/repositories/discussion.ts`. Writes that emit events run through a `UnitOfWork` so the row and the outbox entry commit together, exactly as `progress` does. The entitlements access gate is enforced at the HTTP edge (as `learn.ts` already does for progress), never inside core. Facts owned by other contexts — the author's profile, the course an activity sits in — are resolved by the repository at read time and never stored on a comment.

**Tech Stack:** TypeScript (strict, ESM), Fastify 5, Drizzle ORM, Postgres 17, Zod 4, vitest, `fastify-type-provider-zod`, `@hey-api/openapi-ts`, Next.js 15 (App Router, server components + server actions), React 19.

## Global Constraints

- Specs: `docs/domain/discussion.md` (domain rules) and `docs/superpowers/specs/2026-07-27-discussion-ui-design.md` (UI and contract design). Read both before Task 1.
- Branch: `feat/discussion-domain`, worktree `.claude/worktrees/discussion`. All commands run from the worktree root.
- Node 22, ESM. **Every relative import in `packages/` ends in `.js`**, including from `.ts` files. The Next apps (`apps/admin`, `apps/student`) use extensionless `@/` path aliases — follow the file you are editing.
- `core/` may not import `adapters/`, `http/`, `app/`, `reporting/`, `fastify`, `pg`, or `drizzle-orm`.
- A context imports another context only through its `index.ts`. `core/shared/*` is the exception.
- Domain entities, DTOs and events are declared **once** in `packages/types/src/`. A context's `model.ts` / `types.ts` / `events.ts` re-export — never re-declare.
- The actor on every table is `org_users.id` (composite `(org_id, org_user_id)`). There is no `students` table. Staff-ness is `role !== 'student'`, read fresh; **never stored on a comment**.
- Org-scoped tables use a composite `(org_id, id)` primary key with `org_id` → `organizations.id`.
- **A comment stores no `courseId`.** Which course an activity sits in is content's fact and changes when a course is restructured. Discussion resolves it at read time through a repository port.
- **Replies nest one level.** A reply attaches to a root comment; a reply to a reply is rejected.
- **A course with no settings row is `{ enabled: false, threaded: true, requireReview: false, reactions: true }`.** Discussion is opt-in; the common case stores no row.
- Run `pnpm lint` and `pnpm typecheck` before every commit. Both must pass.
- Never add AI-attribution trailers to commit messages.

---

## File Structure

### Shared person shapes (Tasks 1–2)

| File | Responsibility |
|---|---|
| `packages/types/src/identity.ts` | Add `UserProfile` — a person, keyed on the auth engine's user id. |
| `packages/types/src/organizations.ts` | Add `OrgUserProfile` — one participation, keyed on `org_users.id`. |
| `packages/api-contract/src/shared.ts` | Zod mirrors: `UserProfileSchema`, `OrgUserProfileSchema`, `OrgRole`. |
| `packages/server/src/adapters/db/repositories/org-user-profile.ts` | The one `orgUsers → users → user` display join. |
| `packages/server/src/core/organizations/members.ts` | `Member` extends `OrgUserProfile`. |
| `packages/server/src/reporting/students/model.ts` | `Student` extends `OrgUserProfile`. |
| `packages/server/src/http/fastify.d.ts` | `AuthUser` extends `UserProfile`. |

### Discussion backend (Tasks 3–16)

| File | Responsibility |
|---|---|
| `packages/types/src/discussion.ts` | Entities, DTOs, events. Zero deps. |
| `packages/server/src/core/shared/id.ts` | Add `comment` / `commentReport` id prefixes. |
| `packages/server/src/adapters/db/schema/discussion.ts` | Five tables. |
| `packages/server/src/core/discussion/{model,types,events,ports,index}.ts` | Context contract. |
| `packages/server/src/core/discussion/service.ts` | All domain rules. |
| `packages/server/src/core/discussion/service.test.ts` | Unit tests against fakes. |
| `packages/server/src/adapters/db/repositories/discussion.ts` | Drizzle implementation of the outbound port. |
| `packages/server/src/app/container.ts` | Wire repo + UoW + service. |
| `packages/api-contract/src/discussion.ts` | Zod request/response schemas. |
| `packages/server/src/http/routes/discussion.ts` | Learner + moderator routes. |

### Student thread (Tasks 18–19)

| File | Responsibility |
|---|---|
| `apps/student/src/components/player/discussion/thread-state.ts` | Pure reducer, grouping and permission logic. |
| `apps/student/src/components/player/discussion/thread-state.test.ts` | Vitest over the pure core. |
| `apps/student/src/components/player/discussion/use-thread.ts` | Fetch + mutate; owns the reducer. |
| `apps/student/src/components/player/discussion/discussion-panel.tsx` | The section under `ContentArea`; config gate and states. |
| `apps/student/src/components/player/discussion/comment-item.tsx` | One comment: author, body, age, reactions, actions. |
| `apps/student/src/components/player/discussion/comment-composer.tsx` | The write box, for new comments and replies. |

### Admin moderation (Tasks 20–21)

| File | Responsibility |
|---|---|
| `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/page.tsx` | Server component: settings + queue. |
| `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/actions.ts` | Server actions for every mutation. |
| `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/_components/settings-form.tsx` | Four switches. |
| `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/_components/queue-list.tsx` | Segmented control + cards. |
| `apps/admin/src/app/(dashboard)/courses/[courseId]/_components/item-form-sheet.tsx` | Add the thread-state control. |

---

## Task 1: Shared person shapes

**Files:**
- Modify: `packages/types/src/identity.ts`
- Modify: `packages/types/src/organizations.ts`
- Modify: `packages/api-contract/src/shared.ts`

**Interfaces:**
- Produces: `UserProfile` and `OrgUserProfile` TypeScript interfaces; `UserProfileSchema`, `OrgUserProfileSchema` and `OrgRole` Zod schemas. Task 2 adopts all of them; Task 3 builds `CommentAuthor` off `OrgUserProfile`.

`{ id, name, email, image }` is currently declared ten times across the contract, two contexts, the reporting layer, the auth adapter and both apps. This task declares it twice — deliberately twice, not once, because `Member`/`Student` key `id` on `org_users.id` while `AuthUser`/`SessionUser` key it on the better-auth user id. Identical fields, different referents; one merged type would produce an id that is unsafe to pass anywhere.

- [ ] **Step 1: Add `UserProfile` to identity**

In `packages/types/src/identity.ts`, append after the `User` interface:

```ts
/**
 * A person as displayed. `id` is the auth engine's user id — the same id the
 * session carries — NOT `org_users.id`. Anything keyed on a participation uses
 * OrgUserProfile in ./organizations.ts instead.
 */
export interface UserProfile {
  readonly id: string;
  name: string;
  email: string;
  image: string | null;
}
```

- [ ] **Step 2: Add `OrgUserProfile` to organizations**

In `packages/types/src/organizations.ts`, append after the `OrgUser` interface:

```ts
/**
 * One person's participation in one org, as displayed. `id` is `org_users.id`.
 * `name` is composed from the participation's first and last name; `image` comes
 * from the auth engine's user record, so it is null for a roster entry that has
 * no person behind it yet.
 */
export interface OrgUserProfile {
  readonly id: string;
  name: string;
  email: string;
  image: string | null;
}
```

- [ ] **Step 3: Add the Zod mirrors**

Read `packages/api-contract/src/shared.ts` first to match its existing style. Then append:

```ts
/** All four org roles. `members.ts` exports a staff-only three-value `Role`;
 *  this is the full set, used wherever a learner can also appear. */
export const OrgRole = z.enum(["owner", "admin", "instructor", "student"]);
export type OrgRole = z.infer<typeof OrgRole>;

/** Mirrors UserProfile in @headless-lms/types — keyed on the auth user id. */
export const UserProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
});
export type UserProfileSchema = z.infer<typeof UserProfileSchema>;

/** Mirrors OrgUserProfile in @headless-lms/types — keyed on org_users.id. */
export const OrgUserProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
});
export type OrgUserProfileSchema = z.infer<typeof OrgUserProfileSchema>;
```

If `shared.ts` does not already `import { z } from "zod";`, add it at the top.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @headless-lms/types typecheck && pnpm --filter @headless-lms/api-contract typecheck`
Expected: both exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/identity.ts packages/types/src/organizations.ts packages/api-contract/src/shared.ts
git commit -m "feat(types): declare UserProfile and OrgUserProfile"
```

---

## Task 2: Adopt the shared shapes

**Files:**
- Create: `packages/server/src/adapters/db/repositories/org-user-profile.ts`
- Modify: `packages/server/src/core/organizations/members.ts:8-17`
- Modify: `packages/server/src/reporting/students/model.ts:3-13`
- Modify: `packages/server/src/http/fastify.d.ts:6-12`
- Modify: `packages/server/src/adapters/auth/index.ts:336-342`
- Modify: `packages/api-contract/src/members.ts:12-22`
- Modify: `packages/api-contract/src/students.ts:5-17`
- Modify: `packages/server/src/adapters/db/repositories/members.ts:39-58`
- Modify: `packages/server/src/adapters/db/repositories/students.ts:75-101`

**Interfaces:**
- Consumes: `UserProfile`, `OrgUserProfile`, `UserProfileSchema`, `OrgUserProfileSchema` from Task 1.
- Produces: `orgUserProfileColumns` and `joinOrgUserProfile` from `adapters/db/repositories/org-user-profile.ts`, used again by the discussion repository in Task 12.

This is a type change with no behaviour change. The members and students surfaces must serve byte-identical payloads afterwards, with one deliberate exception: `image` becomes uniformly `string | null` rather than `.nullable().optional()`, so it is always present.

- [ ] **Step 1: Write the shared display join**

Create `packages/server/src/adapters/db/repositories/org-user-profile.ts`:

```ts
// The one display join for a participation's profile.
//
// A person's name and email live on org_users (so a roster entry created before
// the human ever logged in still has them); their avatar lives on the auth
// engine's mirrored `user` table, reached through the identity `users` row. Both
// joins are LEFT: user_id is null until an invitation is accepted.
//
// Sanctioned by .eslintrc.cjs — "db repositories read the auth adapter's
// mirrored `user` table for display joins".
import { sql, eq } from 'drizzle-orm';
import { orgUsers } from '../schema/organizations.js';
import { users } from '../schema/identity.js';
import { user } from '../../auth/schema.js';

/** `first last`, trimmed — the single `name` every person DTO exposes. */
export const orgUserNameExpr = sql<string>`trim(${orgUsers.firstName} || ' ' || ${orgUsers.lastName})`;

/** Spread into a `.select({ ... })` to get the profile columns. */
export const orgUserProfileColumns = {
  id: orgUsers.id,
  name: orgUserNameExpr,
  email: orgUsers.email,
  image: user.image,
};

/** Chain onto a query already `.from(orgUsers)`. */
export function joinOrgUserProfile<T extends {
  leftJoin: (table: unknown, on: unknown) => T;
}>(query: T): T {
  return query
    .leftJoin(users, eq(users.id, orgUsers.userId))
    .leftJoin(user, eq(user.id, users.externalId));
}
```

Confirm the identity schema's export name and path before writing the import:

```bash
grep -rn "export const users" packages/server/src/adapters/db/schema/identity.ts
grep -rn "export const user\b" packages/server/src/adapters/auth/schema.ts
```
Expected: `users` in the first, `user` in the second. If either differs, use the real name.

- [ ] **Step 2: Point the two repositories at it**

In `packages/server/src/adapters/db/repositories/members.ts`, replace the six explicit select keys and the two `leftJoin` lines in `loadAll` (lines 43-58) so the query reads:

```ts
    const memberRows = await joinOrgUserProfile(
      this.db
        .select({
          ...orgUserProfileColumns,
          firstName: orgUsers.firstName,
          lastName: orgUsers.lastName,
          role: orgUsers.role,
          joinedAt: orgUsers.createdAt,
          memberExternalId: orgUsers.externalId,
        })
        .from(orgUsers),
    ).where(and(eq(orgUsers.orgId, orgId), ne(orgUsers.role, STUDENT_ROLE)));
```

Add the import:

```ts
import { orgUserProfileColumns, joinOrgUserProfile } from './org-user-profile.js';
```

`MemberRecord` (line 29) keeps `firstName`/`lastName` if anything downstream composes the name itself; if `toMember` already composes `name`, delete those two select keys and have it read `row.name`. Check which by reading lines 75-95 before editing.

In `packages/server/src/adapters/db/repositories/students.ts`, do the same to the `rows` query (lines 81-95): replace `id`, `name: nameExpr`, `email`, `image` with `...orgUserProfileColumns`, delete the two `leftJoin` lines, wrap the builder in `joinOrgUserProfile(...)`, and delete the now-unused local `nameExpr`. Leave the `groupBy` exactly as it is — it must still list `user.image`.

- [ ] **Step 3: Extend the four type declarations**

`packages/server/src/core/organizations/members.ts` — replace the `Member` interface:

```ts
export interface Member extends OrgUserProfile {
  role: StaffRole;
  status: MemberStatus;
  joinedAt: string | null;
  invitedAt: string | null;
}
```

and add to its imports:

```ts
import type { OrgUserProfile } from '@headless-lms/types';
```

`packages/server/src/reporting/students/model.ts` — replace the `Student` interface:

```ts
export interface Student extends OrgUserProfile {
  entitlementCount: number;
  avgProgress: number;
  joinedAt: string;
  lastActiveAt: string | null;
  hasAccount: boolean;
}
```

and add:

```ts
import type { OrgUserProfile } from '@headless-lms/types';
```

`packages/server/src/http/fastify.d.ts` — replace the `AuthUser` interface:

```ts
// The authenticated person attached to a request by `requireSession`. `id` is
// the auth engine's user id, not org_users.id — see UserProfile.
export interface AuthUser extends UserProfile {
  emailVerified: boolean;
}
```

and add at the top, beside `import 'fastify';`:

```ts
import type { UserProfile } from '@headless-lms/types';
```

`packages/server/src/adapters/auth/index.ts` — replace the inline shape in the `getSession` return type (lines 336-342) with:

```ts
      user: AuthUser;
```

and add to its imports:

```ts
import type { AuthUser } from '../../http/fastify.js';
```

If that import trips the boundary linter, declare the adapter's own alias instead — `type AuthUser = UserProfile & { emailVerified: boolean }` imported from `@headless-lms/types` — rather than reaching into `http/`.

- [ ] **Step 4: Extend the two contract schemas**

`packages/api-contract/src/members.ts` — replace the `Member` object:

```ts
export const Member = OrgUserProfileSchema.extend({
  role: Role,
  status: MemberStatus,
  joinedAt: z.string().nullable(),
  invitedAt: z.string().nullable(),
});
export type Member = z.infer<typeof Member>;
```

and add `OrgUserProfileSchema` to the existing `./shared.js` import.

`packages/api-contract/src/students.ts` — replace the `Student` object:

```ts
export const Student = OrgUserProfileSchema.extend({
  entitlementCount: z.number().int(),
  /** 0–100, averaged across active entitlements. */
  avgProgress: z.number().int(),
  joinedAt: z.string(),
  lastActiveAt: z.string().nullable(),
  hasAccount: z.boolean(),
});
export type Student = z.infer<typeof Student>;
```

and add `OrgUserProfileSchema` to its `./shared.js` import.

Leave `Role` in `members.ts` alone — it is the staff-only three-value enum and several call sites narrow on it.

- [ ] **Step 5: Make `image` always present**

`image` was optional, so both repositories may return rows without the key. Confirm each maps it explicitly:

```bash
grep -n "image" packages/server/src/adapters/db/repositories/members.ts packages/server/src/adapters/db/repositories/students.ts
```
Expected: every `toMember` / `toStudent` mapping has `image: row.image ?? null`. Add it anywhere it is missing — a bare `image: row.image` yields `undefined` for a roster entry, which now fails response validation.

- [ ] **Step 6: Typecheck, lint and run the full suite**

Run: `pnpm typecheck`
Expected: exits 0 across every workspace. Any error here is a call site that assumed the old optionality — fix it rather than widening the type back.

Run: `pnpm lint && pnpm test`
Expected: both exit 0. The members and students tests must pass untouched; if one fails on a missing `image` key, that is Step 5 incomplete, not a test to edit.

- [ ] **Step 7: Commit**

```bash
git add packages/types packages/api-contract packages/server/src
git commit -m "refactor: declare the person shape once and adopt it everywhere"
```

---

## Task 3: Discussion domain types and id prefixes

**Files:**
- Create: `packages/types/src/discussion.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/server/src/core/shared/id.ts:11-28` (the `ID_PREFIXES` map)

**Interfaces:**
- Consumes: `DomainEvent` from `./shared.js`, `OrgUserProfile` from `./organizations.js` (Task 1).
- Produces: `Comment`, `CommentAuthor`, `CommentReaction`, `CommentReport`, `DiscussionSettings`, `ActivityThreadState`, `CommentStatus`, `ThreadState`, `ResolvedThreadConfig`, `PostCommentInput`, `ThreadComment`, `DiscussionEvent` and its four members. `genId('comment')`, `genId('commentReport')`.

- [ ] **Step 1: Write the type module**

Create `packages/types/src/discussion.ts`:

```ts
// discussion context — domain entities, DTOs, and events.
//
// A Comment attaches to an activity and optionally replies to another comment.
// The author is an org_users participation; their profile and role are resolved
// at read time and never stored here. A removed comment is retained so its
// replies survive — only its body stops being served.
//
// A comment records NO course. Which course an activity sits in is content's
// fact and changes when a course is restructured, so it is resolved when
// scoping settings or a queue.

import type { DomainEvent } from "./shared.js";
import type { OrgUserProfile, Role } from "./organizations.js";

export type CommentStatus = "pending" | "published" | "removed";

/** Per-activity override of the course's discussion settings. */
export type ThreadState = "visible" | "hidden" | "locked";

export interface Comment {
  readonly id: string;
  readonly orgId: string;
  readonly activityId: string;
  /** null = a root comment. Replies nest one level: a reply's parent is always
   *  a root comment, so this is never the id of another reply. */
  readonly parentId: string | null;
  /** The author's `org_users.id`. */
  readonly orgUserId: string;
  body: string;
  status: CommentStatus;
  /** The `org_users.id` that removed it; null unless status is "removed". */
  removedBy: string | null;
  readonly createdAt: string;
  updatedAt: string;
}

/**
 * A comment's author as served to a reader: their participation profile plus
 * the role they hold in this org right now. Read fresh on every read — staff
 * standing is never stored on a comment.
 *
 * Deliberately omits `email`. Learners read each other's comments, and the
 * thread must not be a directory of the cohort's addresses. The moderation
 * queue, which does need it, carries `authorEmail` on its own entry type.
 */
export interface CommentAuthor extends Omit<OrgUserProfile, "email"> {
  role: Role;
}

export interface CommentReaction {
  readonly orgId: string;
  readonly commentId: string;
  readonly orgUserId: string;
  readonly emoji: string;
  readonly createdAt: string;
}

export interface CommentReport {
  readonly id: string;
  readonly orgId: string;
  readonly commentId: string;
  /** The reporter's `org_users.id`. */
  readonly orgUserId: string;
  readonly reason: string;
  /** null = still open. */
  resolvedAt: string | null;
  readonly createdAt: string;
}

export interface DiscussionSettings {
  readonly orgId: string;
  readonly courseId: string;
  enabled: boolean;
  /** false = replies are not accepted; the thread is a flat list. */
  threaded: boolean;
  requireReview: boolean;
  reactions: boolean;
}

export interface ActivityThreadState {
  readonly orgId: string;
  readonly activityId: string;
  state: ThreadState;
}

/** The course settings with an activity's override applied. What the service
 *  actually decides against. */
export interface ResolvedThreadConfig {
  enabled: boolean;
  threaded: boolean;
  requireReview: boolean;
  reactions: boolean;
  state: ThreadState;
}

export interface PostCommentInput {
  activityId: string;
  /** null = a root comment. */
  parentId: string | null;
  body: string;
}

/** One comment as served to a reader: the row plus what the reader is allowed
 *  to see. `body` is null when the comment is removed. */
export interface ThreadComment {
  id: string;
  parentId: string | null;
  author: CommentAuthor;
  /** True when the reader wrote this. Resolved server-side: the client knows
   *  the session's auth user id, never its org_users.id, so it cannot compare
   *  against `author.id` itself. */
  isOwn: boolean;
  /** null when removed — the placeholder carries `removedBy` instead. */
  body: string | null;
  status: CommentStatus;
  /** Who removed it — the author themselves, or a moderator. null unless
   *  removed. The placeholder names them. */
  removedBy: CommentAuthor | null;
  reactions: { emoji: string; count: number; reacted: boolean }[];
  createdAt: string;
  updatedAt: string;
}

export interface CommentCreated extends DomainEvent {
  type: "comment.created";
  comment: Comment;
}

export interface CommentPublished extends DomainEvent {
  type: "comment.published";
  comment: Comment;
}

export interface CommentReported extends DomainEvent {
  type: "comment.reported";
  report: CommentReport;
}

export interface CommentRemoved extends DomainEvent {
  type: "comment.removed";
  comment: Comment;
  /** The `org_users.id` that removed it — the author's own, or a moderator's. */
  removedBy: string;
}

export type DiscussionEvent =
  | CommentCreated
  | CommentPublished
  | CommentReported
  | CommentRemoved;
```

- [ ] **Step 2: Export from the types barrel**

In `packages/types/src/index.ts`, add alongside the existing `export *` lines:

```ts
export * from "./discussion.js";
```

- [ ] **Step 3: Add the id prefixes**

In `packages/server/src/core/shared/id.ts`, add two entries to `ID_PREFIXES` after `automationRun`:

```ts
  comment: 'cmt',
  commentReport: 'crp',
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @headless-lms/types typecheck && pnpm --filter @headless-lms/server typecheck`
Expected: both exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/discussion.ts packages/types/src/index.ts packages/server/src/core/shared/id.ts
git commit -m "feat(discussion): add domain types and id prefixes"
```

---

## Task 4: Drizzle schema and migration

**Files:**
- Create: `packages/server/src/adapters/db/schema/discussion.ts`
- Modify: `packages/server/src/adapters/db/schema/index.ts`

**Interfaces:**
- Consumes: `organizations` and `orgUsers` from `./organizations.js`, `activities` and `courses` from `./content.js`.
- Produces: `comments`, `commentReactions`, `commentReports`, `discussionSettings`, `activityThreadStates` Drizzle tables.

`comments` has no `course_id`. The queue scopes to a course by joining `activities → modules`, which is where that fact actually lives.

- [ ] **Step 1: Write the schema**

Create `packages/server/src/adapters/db/schema/discussion.ts`:

```ts
// discussion tables — comments on an activity, their reactions and reports,
// plus per-course settings and an optional per-activity thread state.
//
// The author is always an org_users participation, so one column covers both
// learners and staff. Staff-ness is NOT stored — it is read from the author's
// current role. A removed comment keeps its row so replies below it survive;
// only the body stops being served.
//
// No course_id: which course an activity sits in is content's fact and changes
// when a course is restructured. The queue joins to modules to scope by course.
import {
  pgTable,
  text,
  boolean,
  timestamp,
  primaryKey,
  foreignKey,
  unique,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { genId } from '../../../core/shared/id.js';
import { organizations, orgUsers } from './organizations.js';
import { activities, courses } from './content.js';

export const comments = pgTable(
  'comments',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('comment')),
    activityId: text('activity_id').notNull(),
    parentId: text('parent_id'),
    orgUserId: text('org_user_id').notNull(),
    body: text('body').notNull(),
    status: text('status', { enum: ['pending', 'published', 'removed'] })
      .notNull()
      .default('published'),
    removedBy: text('removed_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // Removing an activity removes its discussion (spec, boundary 1).
    activityFk: foreignKey({
      columns: [t.orgId, t.activityId],
      foreignColumns: [activities.orgId, activities.id],
    }).onDelete('cascade'),
    authorFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    removedByFk: foreignKey({
      columns: [t.orgId, t.removedBy],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    // No cascade: removing a parent must not delete its replies.
    parentFk: foreignKey({
      columns: [t.orgId, t.parentId],
      foreignColumns: [t.orgId, t.id],
    }),
    // removed_by is set if and only if the comment is removed.
    removedCk: check(
      'comments_removed_by_check',
      sql`(${t.status} = 'removed') = (${t.removedBy} is not null)`,
    ),
    threadIdx: index('comments_thread_idx').on(t.orgId, t.activityId, t.status, t.createdAt),
    // The queue filters by status org-wide, then narrows by course through the
    // activity join — so the index leads on status, not on a stored course.
    queueIdx: index('comments_queue_idx').on(t.orgId, t.status, t.createdAt),
  }),
);

export const commentReactions = pgTable(
  'comment_reactions',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    commentId: text('comment_id').notNull(),
    orgUserId: text('org_user_id').notNull(),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One reaction per person, per comment, per kind.
    pk: primaryKey({ columns: [t.orgId, t.commentId, t.orgUserId, t.emoji] }),
    commentFk: foreignKey({
      columns: [t.orgId, t.commentId],
      foreignColumns: [comments.orgId, comments.id],
    }).onDelete('cascade'),
    authorFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
  }),
);

export const commentReports = pgTable(
  'comment_reports',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('commentReport')),
    commentId: text('comment_id').notNull(),
    orgUserId: text('org_user_id').notNull(),
    reason: text('reason').notNull().default(''),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // One report per person, per comment.
    reporterUq: unique().on(t.orgId, t.commentId, t.orgUserId),
    commentFk: foreignKey({
      columns: [t.orgId, t.commentId],
      foreignColumns: [comments.orgId, comments.id],
    }).onDelete('cascade'),
    reporterFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }),
    openIdx: index('comment_reports_open_idx').on(t.orgId, t.commentId, t.resolvedAt),
  }),
);

// One row per course that has been configured. Absent = DEFAULT_SETTINGS.
export const discussionSettings = pgTable(
  'discussion_settings',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    courseId: text('course_id').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    threaded: boolean('threaded').notNull().default(true),
    requireReview: boolean('require_review').notNull().default(false),
    reactions: boolean('reactions').notNull().default(true),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.courseId] }),
    courseFk: foreignKey({
      columns: [t.orgId, t.courseId],
      foreignColumns: [courses.orgId, courses.id],
    }).onDelete('cascade'),
  }),
);

// One row per activity that overrides its course. Absent = the course setting.
export const activityThreadStates = pgTable(
  'activity_thread_states',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    activityId: text('activity_id').notNull(),
    state: text('state', { enum: ['visible', 'hidden', 'locked'] }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.activityId] }),
    activityFk: foreignKey({
      columns: [t.orgId, t.activityId],
      foreignColumns: [activities.orgId, activities.id],
    }).onDelete('cascade'),
  }),
);
```

- [ ] **Step 2: Export from the schema barrel**

In `packages/server/src/adapters/db/schema/index.ts`, add alongside the existing exports:

```ts
export * from './discussion.js';
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file under `packages/server/drizzle/` creating the five tables. Open it and confirm it contains `CREATE TABLE "comments"`, `"comment_reactions"`, `"comment_reports"`, `"discussion_settings"`, `"activity_thread_states"` — and no `DROP` of any existing table. If a `DROP` appears, stop: the schema barrel is picking up something unintended.

- [ ] **Step 4: Apply and verify**

Run: `docker compose -f docker/docker-compose.yml up -d && pnpm db:migrate`
Expected: exits 0.

Then verify the self-referencing parent FK does not cascade, and that no course column exists:

```bash
psql "$DATABASE_URL" -c "\d comments"
```
Expected: the `parent_id` foreign key line has no `ON DELETE CASCADE`, and there is no `course_id` column.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @headless-lms/server typecheck`
Expected: exits 0.

```bash
git add packages/server/src/adapters/db/schema/discussion.ts packages/server/src/adapters/db/schema/index.ts packages/server/drizzle
git commit -m "feat(discussion): add comments, reactions, reports and settings tables"
```

---

## Task 5: Context skeleton — model, types, events, ports, index

**Files:**
- Create: `packages/server/src/core/discussion/model.ts`
- Create: `packages/server/src/core/discussion/types.ts`
- Create: `packages/server/src/core/discussion/events.ts`
- Create: `packages/server/src/core/discussion/ports.ts`
- Create: `packages/server/src/core/discussion/index.ts`
- Modify: `.eslintrc.cjs:19-26` (the context list)
- Modify: `packages/server/src/core/shared/errors.ts`

**Interfaces:**
- Consumes: the types from Task 3; `OutboxAppender`, `UnitOfWork`, `NewDomainEvent`, `Logger` from `../shared/ports.js`.
- Produces: `DiscussionService`, `DiscussionRepository`, `DiscussionUnitOfWork`, `DiscussionWriteScope`, `NewDiscussionEvent`, `Actor`, `AuthorRecord`, `CommentWithContext`, `ThreadView`, `QueueEntry`, `QueueQuery`, `ForbiddenError`.

- [ ] **Step 1: Write model.ts, types.ts, events.ts**

`packages/server/src/core/discussion/model.ts`:

```ts
// discussion context — domain entities, owned by @headless-lms/types.
export type {
  Comment,
  CommentAuthor,
  CommentStatus,
  CommentReaction,
  CommentReport,
  DiscussionSettings,
  ActivityThreadState,
  ThreadState,
} from '@headless-lms/types';
```

`packages/server/src/core/discussion/types.ts`:

```ts
// discussion context — DTOs, owned by @headless-lms/types.
export type {
  PostCommentInput,
  ResolvedThreadConfig,
  ThreadComment,
} from '@headless-lms/types';
```

`packages/server/src/core/discussion/events.ts`:

```ts
// discussion context — domain events, owned by @headless-lms/types.
import type { NewDomainEvent } from '../shared/ports.js';
import type { DiscussionEvent } from '@headless-lms/types';

export type {
  DiscussionEvent,
  CommentCreated,
  CommentPublished,
  CommentReported,
  CommentRemoved,
} from '@headless-lms/types';
export type NewDiscussionEvent = NewDomainEvent<DiscussionEvent>;
```

- [ ] **Step 2: Write ports.ts**

```ts
// discussion context — ports.
// Inbound: the use cases the service implements.
// Outbound: the persistence contract the repository fulfils.
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type {
  Comment,
  CommentAuthor,
  CommentReaction,
  CommentReport,
  DiscussionSettings,
  ThreadState,
} from './model.js';
import type { PostCommentInput, ResolvedThreadConfig, ThreadComment } from './types.js';

/** Everything a reader needs to render one activity's thread. */
export interface ThreadView {
  config: ResolvedThreadConfig;
  comments: ThreadComment[];
}

/** One entry in a moderator's work queue. Carries what the decision needs:
 *  who wrote it, where it sits, and — for a reported comment — who flagged it
 *  and why. A bare count is not something a moderator can act on. */
export interface QueueEntry {
  comment: Comment;
  author: CommentAuthor;
  /** Present only here. The queue is staff-scoped, and identifying a spam
   *  account is the decision being asked for. Never on a ThreadComment. */
  authorEmail: string;
  /** Resolved from content at read time, never stored. */
  courseId: string;
  activityTitle: string;
  reports: { reporter: CommentAuthor; reason: string; createdAt: string }[];
}

export interface QueueQuery {
  /** Scope to one course; omitted = the whole org. Resolved through the
   *  activity's module, since a comment stores no course. */
  courseId?: string;
  /** "pending" = awaiting review; "reported" = carrying unresolved reports. */
  kind: 'pending' | 'reported';
}

/**
 * Who is acting, and whether they hold staff standing in this org.
 *
 * `isStaff` is resolved at the HTTP edge from the session's active-org role and
 * handed in — read fresh on every request, never stored on a comment. Core does
 * not look a role up to make an authorisation decision; it reads roles back only
 * to render an author, which is presentation.
 */
export interface Actor {
  orgUserId: string;
  isStaff: boolean;
}

/** A profile row as the repository loads it. `email` is stripped before a
 *  thread is served and kept only for the moderation queue. */
export interface AuthorRecord extends CommentAuthor {
  email: string;
}

/** A comment with the content facts resolved at read time. Never stored. */
export interface CommentWithContext {
  comment: Comment;
  courseId: string;
  activityTitle: string;
}

export interface DiscussionService {
  /** The course's settings, or DEFAULT_SETTINGS when none are stored. */
  getSettings(orgId: string, courseId: string): Promise<DiscussionSettings>;
  setSettings(
    orgId: string,
    courseId: string,
    patch: Partial<Omit<DiscussionSettings, 'orgId' | 'courseId'>>,
  ): Promise<DiscussionSettings>;
  /** null clears the override so the course setting applies again. */
  setThreadState(orgId: string, activityId: string, state: ThreadState | null): Promise<void>;
  /** Every explicit override in a course, keyed by activity id. Activities with
   *  no override are absent — they inherit. */
  listThreadStates(orgId: string, courseId: string): Promise<Record<string, ThreadState>>;
  /** Course settings with the activity's override applied. Resolves the course
   *  from the activity. */
  resolveConfig(orgId: string, activityId: string): Promise<ResolvedThreadConfig>;

  /** Post a root comment or a reply. Lands pending where review is required and
   *  the poster is not staff. */
  post(orgId: string, actor: Actor, input: PostCommentInput): Promise<ThreadComment>;
  /** Author-only. Throws ForbiddenError for anyone else, staff included. */
  edit(orgId: string, commentId: string, actor: Actor, body: string): Promise<ThreadComment>;
  /** The author, or anyone whose role is staff. */
  remove(orgId: string, commentId: string, actor: Actor): Promise<Comment>;
  /** Staff only. Returns the comment to published. */
  restore(orgId: string, commentId: string, actor: Actor): Promise<Comment>;
  /** Staff only. Publishes a pending comment. */
  approve(orgId: string, commentId: string, actor: Actor): Promise<Comment>;

  /** The thread as this reader may see it. */
  listThread(orgId: string, activityId: string, actor: Actor): Promise<ThreadView>;

  react(orgId: string, commentId: string, actor: Actor, emoji: string): Promise<void>;
  unreact(orgId: string, commentId: string, actor: Actor, emoji: string): Promise<void>;

  /** Accepted even on a locked thread — an archived thread can still hold
   *  something a moderator needs to see. */
  report(orgId: string, commentId: string, actor: Actor, reason: string): Promise<CommentReport>;
  /** Staff only. Resolves every open report on the comment at once. */
  resolveReports(orgId: string, commentId: string, actor: Actor): Promise<void>;

  queue(orgId: string, query: QueueQuery): Promise<QueueEntry[]>;
}

export interface DiscussionRepository {
  insertComment(orgId: string, comment: Comment): Promise<Comment>;
  findComment(orgId: string, id: string): Promise<Comment | null>;
  updateComment(
    orgId: string,
    id: string,
    patch: Partial<Pick<Comment, 'body' | 'status' | 'removedBy' | 'updatedAt'>>,
  ): Promise<Comment | null>;
  /** Every comment on the activity, oldest first, including removed ones. */
  listByActivity(orgId: string, activityId: string): Promise<Comment[]>;

  listReactions(orgId: string, commentIds: string[]): Promise<CommentReaction[]>;
  insertReaction(orgId: string, reaction: CommentReaction): Promise<void>;
  deleteReaction(
    orgId: string,
    commentId: string,
    orgUserId: string,
    emoji: string,
  ): Promise<void>;

  /** Returns null when this person has already reported this comment. */
  insertReport(orgId: string, report: CommentReport): Promise<CommentReport | null>;
  /** Every unresolved report against the given comments. */
  listOpenReports(orgId: string, commentIds: string[]): Promise<CommentReport[]>;
  /** Resolves every open report on one comment. */
  resolveReportsFor(orgId: string, commentId: string, resolvedAt: string): Promise<void>;

  findSettings(orgId: string, courseId: string): Promise<DiscussionSettings | null>;
  upsertSettings(orgId: string, settings: DiscussionSettings): Promise<DiscussionSettings>;
  findThreadState(orgId: string, activityId: string): Promise<ThreadState | null>;
  /** Overrides for every activity in the course, keyed by activity id. */
  listThreadStatesByCourse(orgId: string, courseId: string): Promise<Record<string, ThreadState>>;
  upsertThreadState(orgId: string, activityId: string, state: ThreadState): Promise<void>;
  clearThreadState(orgId: string, activityId: string): Promise<void>;

  /** The course an activity sits in, via its module. null when the activity
   *  does not exist. Content's fact, resolved here rather than copied. */
  courseOfActivity(orgId: string, activityId: string): Promise<string | null>;
  /** Comments in `status`, with their course and activity title resolved.
   *  Scoped to a course when given. */
  listByStatusWithContext(
    orgId: string,
    status: Comment['status'],
    courseId?: string,
  ): Promise<CommentWithContext[]>;
  /** Comments carrying at least one unresolved report, same resolution. */
  listReportedWithContext(orgId: string, courseId?: string): Promise<CommentWithContext[]>;

  /** Profiles and current roles of the given participations, keyed by
   *  org_users.id. One join covers the author badge, the moderation card and
   *  the removal placeholder. */
  authorsOf(orgId: string, orgUserIds: string[]): Promise<Record<string, AuthorRecord>>;
}

/** Writes that emit events run through this scope so the row and the outbox
 *  entry commit in one transaction. */
export interface DiscussionWriteScope {
  discussion: DiscussionRepository;
  outbox: OutboxAppender;
}
export type DiscussionUnitOfWork = UnitOfWork<DiscussionWriteScope>;
```

- [ ] **Step 3: Write index.ts**

```ts
// discussion context — public surface. Re-export only what other layers may use.
export { DiscussionServiceImpl, DEFAULT_SETTINGS } from './service.js';
export type {
  DiscussionService,
  DiscussionRepository,
  DiscussionUnitOfWork,
  DiscussionWriteScope,
  ThreadView,
  QueueEntry,
  QueueQuery,
  Actor,
  AuthorRecord,
  CommentWithContext,
} from './ports.js';
export type {
  Comment,
  CommentAuthor,
  CommentStatus,
  CommentReaction,
  CommentReport,
  DiscussionSettings,
  ActivityThreadState,
  ThreadState,
} from './model.js';
export type { PostCommentInput, ResolvedThreadConfig, ThreadComment } from './types.js';
export type { DiscussionEvent } from './events.js';
```

- [ ] **Step 4: Add `discussion` to the eslint context list**

In `.eslintrc.cjs`, add `"discussion",` to the array at lines 19-26, after `"automations"`.

- [ ] **Step 5: Add a ForbiddenError**

The service needs a permission failure distinct from not-found. In `packages/server/src/core/shared/errors.ts`, append:

```ts
/** The caller is authenticated but not permitted to perform this command.
 *  The HTTP layer maps this to 403. */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}
```

Then map it in the HTTP error handler. Find the file that maps `ConflictError` to 409:

```bash
grep -rn "ConflictError" packages/server/src/http/ | grep -v routes/
```

Add a `ForbiddenError` → 403 branch beside it, matching the existing style exactly.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @headless-lms/server typecheck`
Expected: FAILS with "Cannot find module './service.js'" — `index.ts` references a service that does not exist yet. This is expected; Task 6 creates it.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/core/discussion .eslintrc.cjs packages/server/src/core/shared/errors.ts packages/server/src/http
git commit -m "feat(discussion): add context ports, model and event contract"
```

---

## Task 6: Settings resolution

**Files:**
- Create: `packages/server/src/core/discussion/service.ts`
- Create: `packages/server/src/core/discussion/service.test.ts`

**Interfaces:**
- Consumes: `DiscussionRepository`, `DiscussionUnitOfWork`, `Actor`, `AuthorRecord`, `CommentWithContext` from `./ports.js`.
- Produces: `DiscussionServiceImpl` class, `DEFAULT_SETTINGS` const, and the test helpers `fakeRepo()`, `fakeUow()`, `makeService()` that every later task's tests reuse. Later tasks add methods to the same class.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/core/discussion/service.test.ts`. This file grows through Task 11; the fake below is complete from the start so no later task has to revisit it.

```ts
import { describe, it, expect } from 'vitest';
import { DiscussionServiceImpl, DEFAULT_SETTINGS } from './service.js';
import type {
  AuthorRecord,
  CommentWithContext,
  DiscussionRepository,
  DiscussionUnitOfWork,
} from './ports.js';
import type {
  Comment,
  CommentReaction,
  CommentReport,
  DiscussionSettings,
  ThreadState,
} from './model.js';
import type { NewDiscussionEvent } from './events.js';

/** Every activity in these tests belongs to course c1 unless a test says
 *  otherwise — the service resolves the course rather than being handed it. */
export function fakeRepo() {
  const comments: Comment[] = [];
  const reactions: CommentReaction[] = [];
  const reports: CommentReport[] = [];
  const settings = new Map<string, DiscussionSettings>();
  const threadStates = new Map<string, ThreadState>();
  const authors = new Map<string, AuthorRecord>();
  const activityCourse = new Map<string, string>([
    ['a1', 'c1'],
    ['a2', 'c1'],
  ]);
  const activityTitle = new Map<string, string>([
    ['a1', 'Lesson one'],
    ['a2', 'Lesson two'],
  ]);

  function author(id: string): AuthorRecord {
    return (
      authors.get(id) ?? {
        id,
        name: id,
        image: null,
        role: 'student',
        email: `${id}@example.test`,
      }
    );
  }

  function withContext(list: Comment[], courseId?: string): CommentWithContext[] {
    return list
      .map((comment) => ({
        comment,
        courseId: activityCourse.get(comment.activityId) ?? '',
        activityTitle: activityTitle.get(comment.activityId) ?? '',
      }))
      .filter((e) => courseId === undefined || e.courseId === courseId);
  }

  const repo: DiscussionRepository = {
    async insertComment(_orgId, comment) {
      comments.push({ ...comment });
      return comment;
    },
    async findComment(orgId, id) {
      return comments.find((c) => c.orgId === orgId && c.id === id) ?? null;
    },
    async updateComment(orgId, id, patch) {
      const c = comments.find((x) => x.orgId === orgId && x.id === id);
      if (!c) return null;
      Object.assign(c, patch);
      return { ...c };
    },
    async listByActivity(orgId, activityId) {
      return comments
        .filter((c) => c.orgId === orgId && c.activityId === activityId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((c) => ({ ...c }));
    },
    async listReactions(orgId, commentIds) {
      return reactions.filter((r) => r.orgId === orgId && commentIds.includes(r.commentId));
    },
    async insertReaction(_orgId, reaction) {
      const dup = reactions.some(
        (r) =>
          r.orgId === reaction.orgId &&
          r.commentId === reaction.commentId &&
          r.orgUserId === reaction.orgUserId &&
          r.emoji === reaction.emoji,
      );
      if (!dup) reactions.push({ ...reaction });
    },
    async deleteReaction(orgId, commentId, orgUserId, emoji) {
      const i = reactions.findIndex(
        (r) =>
          r.orgId === orgId &&
          r.commentId === commentId &&
          r.orgUserId === orgUserId &&
          r.emoji === emoji,
      );
      if (i >= 0) reactions.splice(i, 1);
    },
    async insertReport(_orgId, report) {
      const dup = reports.some(
        (r) =>
          r.orgId === report.orgId &&
          r.commentId === report.commentId &&
          r.orgUserId === report.orgUserId,
      );
      if (dup) return null;
      reports.push({ ...report });
      return report;
    },
    async listOpenReports(orgId, commentIds) {
      return reports
        .filter((r) => r.orgId === orgId && !r.resolvedAt && commentIds.includes(r.commentId))
        .map((r) => ({ ...r }));
    },
    async resolveReportsFor(orgId, commentId, resolvedAt) {
      for (const r of reports) {
        if (r.orgId === orgId && r.commentId === commentId && !r.resolvedAt) {
          r.resolvedAt = resolvedAt;
        }
      }
    },
    async findSettings(orgId, courseId) {
      return settings.get(`${orgId}:${courseId}`) ?? null;
    },
    async upsertSettings(orgId, next) {
      settings.set(`${orgId}:${next.courseId}`, { ...next });
      return { ...next };
    },
    async findThreadState(orgId, activityId) {
      return threadStates.get(`${orgId}:${activityId}`) ?? null;
    },
    async listThreadStatesByCourse(orgId, courseId) {
      const out: Record<string, ThreadState> = {};
      for (const [key, state] of threadStates) {
        const [keyOrg, activityId] = key.split(':');
        if (keyOrg === orgId && activityCourse.get(activityId!) === courseId) {
          out[activityId!] = state;
        }
      }
      return out;
    },
    async upsertThreadState(orgId, activityId, state) {
      threadStates.set(`${orgId}:${activityId}`, state);
    },
    async clearThreadState(orgId, activityId) {
      threadStates.delete(`${orgId}:${activityId}`);
    },
    async courseOfActivity(_orgId, activityId) {
      return activityCourse.get(activityId) ?? null;
    },
    async listByStatusWithContext(orgId, status, courseId) {
      return withContext(
        comments.filter((c) => c.orgId === orgId && c.status === status),
        courseId,
      );
    },
    async listReportedWithContext(orgId, courseId) {
      const open = new Set(reports.filter((r) => !r.resolvedAt).map((r) => r.commentId));
      return withContext(
        comments.filter((c) => c.orgId === orgId && open.has(c.id)),
        courseId,
      );
    },
    async authorsOf(_orgId, orgUserIds) {
      const out: Record<string, AuthorRecord> = {};
      for (const id of orgUserIds) out[id] = author(id);
      return out;
    },
  };
  return { repo, comments, reactions, reports, settings, threadStates, authors, activityCourse };
}

export function fakeUow(repo: DiscussionRepository) {
  const appended: NewDiscussionEvent[] = [];
  const uow: DiscussionUnitOfWork = {
    run: (fn) =>
      fn({
        discussion: repo,
        outbox: {
          append: async (events) => {
            appended.push(...(events as unknown as NewDiscussionEvent[]));
          },
        },
      }),
  };
  return { uow, appended };
}

export function makeService(fake = fakeRepo()) {
  const { uow, appended } = fakeUow(fake.repo);
  const service = new DiscussionServiceImpl(fake.repo, uow, () => '2026-07-27T00:00:00.000Z');
  return { service, appended, ...fake };
}

describe('settings', () => {
  it('returns the defaults for a course with no stored settings', async () => {
    const { service } = makeService();
    const settings = await service.getSettings('o1', 'c1');
    expect(settings).toEqual({ orgId: 'o1', courseId: 'c1', ...DEFAULT_SETTINGS });
  });

  it('merges a patch over the defaults and persists the whole row', async () => {
    const { service } = makeService();
    const saved = await service.setSettings('o1', 'c1', { enabled: true, requireReview: true });
    expect(saved).toEqual({
      orgId: 'o1',
      courseId: 'c1',
      enabled: true,
      threaded: true,
      requireReview: true,
      reactions: true,
    });
    expect(await service.getSettings('o1', 'c1')).toEqual(saved);
  });

  it('resolves the course from the activity, not from a caller argument', async () => {
    const { service } = makeService();
    await service.setSettings('o1', 'c1', { enabled: true });
    const config = await service.resolveConfig('o1', 'a1');
    expect(config).toEqual({
      enabled: true,
      threaded: true,
      requireReview: false,
      reactions: true,
      state: 'visible',
    });
  });

  it('throws NotFoundError for an activity that does not exist', async () => {
    const { service } = makeService();
    await expect(service.resolveConfig('o1', 'nope')).rejects.toThrow(NotFoundError);
  });

  it("lets an activity's thread state override the course", async () => {
    const { service } = makeService();
    await service.setSettings('o1', 'c1', { enabled: true });
    await service.setThreadState('o1', 'a1', 'locked');
    expect((await service.resolveConfig('o1', 'a1')).state).toBe('locked');
  });

  it('falls back to the course setting once the override is cleared', async () => {
    const { service } = makeService();
    await service.setSettings('o1', 'c1', { enabled: true });
    await service.setThreadState('o1', 'a1', 'hidden');
    await service.setThreadState('o1', 'a1', null);
    expect((await service.resolveConfig('o1', 'a1')).state).toBe('visible');
  });

  it('resolves state to hidden when discussion is disabled for the course', async () => {
    const { service } = makeService();
    const config = await service.resolveConfig('o1', 'a1');
    expect(config.enabled).toBe(false);
    expect(config.state).toBe('hidden');
  });

  it('lists only the activities in the course that carry an override', async () => {
    const { service } = makeService();
    await service.setThreadState('o1', 'a1', 'locked');
    expect(await service.listThreadStates('o1', 'c1')).toEqual({ a1: 'locked' });
  });
});
```

Add this import at the top of the test file:

```ts
import { NotFoundError } from '../shared/errors.js';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts`
Expected: FAIL — `Failed to resolve import "./service.js"`.

- [ ] **Step 3: Write the service**

Create `packages/server/src/core/discussion/service.ts`:

```ts
// discussion context — service implementation (inbound port).
//
// Owns every discussion rule: which settings apply to a thread, whether a new
// comment lands pending, who may edit/remove/moderate, and what a given reader
// is served. The caller's staff standing arrives as an `Actor` resolved at the
// HTTP edge — core never looks a role up to make a decision. Profiles and roles
// ARE read back to render an author, which is presentation, not authorisation.
//
// A comment stores no course. Every path that needs one resolves it from the
// activity through the repository.
import { genId } from '../shared/id.js';
import { ForbiddenError, NotFoundError } from '../shared/errors.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { DiscussionSettings, ThreadState } from './model.js';
import type { ResolvedThreadConfig } from './types.js';
import type {
  DiscussionRepository,
  DiscussionService,
  DiscussionUnitOfWork,
} from './ports.js';

/** A course with no stored settings. Discussion is opt-in, so the common case
 *  persists no row at all and every existing course stays silent. */
export const DEFAULT_SETTINGS = {
  enabled: false,
  threaded: true,
  requireReview: false,
  reactions: true,
} as const;

export class DiscussionServiceImpl implements DiscussionService {
  constructor(
    private readonly repo: DiscussionRepository,
    private readonly uow: DiscussionUnitOfWork,
    private readonly now: () => string,
    private readonly logger: Logger = noopLogger,
  ) {}

  async getSettings(orgId: string, courseId: string): Promise<DiscussionSettings> {
    const stored = await this.repo.findSettings(orgId, courseId);
    return stored ?? { orgId, courseId, ...DEFAULT_SETTINGS };
  }

  async setSettings(
    orgId: string,
    courseId: string,
    patch: Partial<Omit<DiscussionSettings, 'orgId' | 'courseId'>>,
  ): Promise<DiscussionSettings> {
    const current = await this.getSettings(orgId, courseId);
    return this.repo.upsertSettings(orgId, { ...current, ...patch });
  }

  async setThreadState(
    orgId: string,
    activityId: string,
    state: ThreadState | null,
  ): Promise<void> {
    if (state === null) {
      await this.repo.clearThreadState(orgId, activityId);
      return;
    }
    await this.repo.upsertThreadState(orgId, activityId, state);
  }

  listThreadStates(orgId: string, courseId: string): Promise<Record<string, ThreadState>> {
    return this.repo.listThreadStatesByCourse(orgId, courseId);
  }

  /** The course an activity sits in. Content owns this fact; discussion reads
   *  it here rather than storing a copy that goes stale on a restructure. */
  private async courseOf(orgId: string, activityId: string): Promise<string> {
    const courseId = await this.repo.courseOfActivity(orgId, activityId);
    if (!courseId) {
      throw new NotFoundError('Activity', activityId);
    }
    return courseId;
  }

  async resolveConfig(orgId: string, activityId: string): Promise<ResolvedThreadConfig> {
    const courseId = await this.courseOf(orgId, activityId);
    const settings = await this.getSettings(orgId, courseId);
    const override = await this.repo.findThreadState(orgId, activityId);
    // Discussion off for the course cannot be overridden back on by an
    // activity: the course switch is the master.
    const state: ThreadState = !settings.enabled ? 'hidden' : (override ?? 'visible');
    return {
      enabled: settings.enabled,
      threaded: settings.threaded,
      requireReview: settings.requireReview,
      reactions: settings.reactions,
      state,
    };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts`
Expected: PASS, 8 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/discussion/service.ts packages/server/src/core/discussion/service.test.ts
git commit -m "feat(discussion): resolve course settings and per-activity thread state"
```

---

## Task 7: Posting a comment

**Files:**
- Modify: `packages/server/src/core/discussion/service.ts`
- Modify: `packages/server/src/core/discussion/service.test.ts`

**Interfaces:**
- Consumes: `DiscussionServiceImpl` from Task 6, `Actor` from `./ports.js`.
- Produces: `DiscussionServiceImpl.post(orgId, actor, input): Promise<ThreadComment>` and the private `renderOne` helper that Task 8's `listThread` and Task 9's `edit` both reuse.

Rules from the spec, all of which need a test:
1. Nothing is accepted when the resolved state is `hidden` or `locked`.
2. Replies are rejected when `threaded` is false.
3. **Replies nest one level** — a reply whose parent already has a parent is rejected.
4. A learner's comment is `pending` when `requireReview`; a staff comment is always `published`.
5. A pending comment is not a reply target.
6. `comment.created` is emitted for every post.
7. The returned `ThreadComment` carries a resolved author and no email.

- [ ] **Step 1: Write the failing tests**

Append to `service.test.ts`:

```ts
const learner: Actor = { orgUserId: 'orm_learner', isStaff: false };
const staff: Actor = { orgUserId: 'orm_staff', isStaff: true };

async function enabled(service: DiscussionServiceImpl, patch = {}) {
  await service.setSettings('o1', 'c1', { enabled: true, ...patch });
}

describe('post', () => {
  it('publishes a learner comment when review is off', async () => {
    const { service, appended } = makeService();
    await enabled(service);
    const comment = await service.post('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'first',
    });
    expect(comment.status).toBe('published');
    expect(appended).toHaveLength(1);
    expect(appended[0]?.type).toBe('comment.created');
  });

  it('returns a resolved author and never an email', async () => {
    const fake = fakeRepo();
    fake.authors.set('orm_staff', {
      id: 'orm_staff',
      name: 'Sarah Chen',
      image: 'https://img.test/s.png',
      role: 'instructor',
      email: 'sarah@example.test',
    });
    const { service } = makeService(fake);
    await enabled(service);
    const comment = await service.post('o1', staff, {
      activityId: 'a1',
      parentId: null,
      body: 'hello',
    });
    expect(comment.author).toEqual({
      id: 'orm_staff',
      name: 'Sarah Chen',
      image: 'https://img.test/s.png',
      role: 'instructor',
    });
    expect('email' in comment.author).toBe(false);
  });

  it('holds a learner comment pending when review is on', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const comment = await service.post('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'q',
    });
    expect(comment.status).toBe('pending');
  });

  it('publishes a staff comment even when review is on', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const comment = await service.post('o1', staff, {
      activityId: 'a1',
      parentId: null,
      body: 'answer',
    });
    expect(comment.status).toBe('published');
  });

  it('refuses to post when discussion is disabled for the course', async () => {
    const { service } = makeService();
    await expect(
      service.post('o1', learner, { activityId: 'a1', parentId: null, body: 'x' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses to post to a locked thread', async () => {
    const { service } = makeService();
    await enabled(service);
    await service.setThreadState('o1', 'a1', 'locked');
    await expect(
      service.post('o1', learner, { activityId: 'a1', parentId: null, body: 'x' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reply when replies are disabled', async () => {
    const { service } = makeService();
    await enabled(service, { threaded: false });
    const root = await service.post('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    await expect(
      service.post('o1', learner, { activityId: 'a1', parentId: root.id, body: 'reply' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reply to a reply — nesting is one level', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.post('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    const reply = await service.post('o1', staff, {
      activityId: 'a1',
      parentId: root.id,
      body: 'reply',
    });
    await expect(
      service.post('o1', learner, { activityId: 'a1', parentId: reply.id, body: 'nested' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reply to a pending comment', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const pending = await service.post('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'q',
    });
    await expect(
      service.post('o1', staff, { activityId: 'a1', parentId: pending.id, body: 'reply' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reply to a comment on a different activity', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.post('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    await expect(
      service.post('o1', learner, { activityId: 'a2', parentId: root.id, body: 'reply' }),
    ).rejects.toThrow(NotFoundError);
  });
});
```

Add the imports this needs to the top of the test file:

```ts
import { ForbiddenError } from '../shared/errors.js';
import type { Actor } from './ports.js';
```

(`NotFoundError` is already imported from Task 6.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts -t "post"`
Expected: FAIL — `service.post is not a function`.

- [ ] **Step 3: Implement `renderOne` and `post`**

Add to `DiscussionServiceImpl` in `service.ts`:

```ts
  /** Strip the email a profile row carries — a thread must never expose one. */
  private toAuthor(record: AuthorRecord): CommentAuthor {
    return { id: record.id, name: record.name, image: record.image, role: record.role };
  }

  /** Render one comment with no reaction context. Used by post and edit, where
   *  the caller has just written the row and needs it back in the same shape
   *  the thread serves. */
  private async renderOne(
    orgId: string,
    comment: Comment,
    actor: Actor,
  ): Promise<ThreadComment> {
    const ids = [comment.orgUserId, ...(comment.removedBy ? [comment.removedBy] : [])];
    const records = await this.repo.authorsOf(orgId, [...new Set(ids)]);
    const author = records[comment.orgUserId];
    if (!author) {
      throw new NotFoundError('OrgUser', comment.orgUserId);
    }
    const remover = comment.removedBy ? records[comment.removedBy] : undefined;
    return {
      id: comment.id,
      parentId: comment.parentId,
      author: this.toAuthor(author),
      isOwn: comment.orgUserId === actor.orgUserId,
      body: comment.status === 'removed' ? null : comment.body,
      status: comment.status,
      removedBy: remover ? this.toAuthor(remover) : null,
      reactions: [],
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  async post(orgId: string, actor: Actor, input: PostCommentInput): Promise<ThreadComment> {
    const config = await this.resolveConfig(orgId, input.activityId);
    if (config.state !== 'visible') {
      throw new ForbiddenError('discussion is not open on this activity');
    }
    if (input.parentId !== null) {
      if (!config.threaded) {
        throw new ForbiddenError('replies are disabled on this course');
      }
      const parent = await this.repo.findComment(orgId, input.parentId);
      if (!parent || parent.activityId !== input.activityId) {
        throw new NotFoundError('Comment', input.parentId);
      }
      // One level. A reply hangs off a root comment; a reply to a reply would
      // start an indent ladder no reader benefits from.
      if (parent.parentId !== null) {
        throw new ForbiddenError('replies nest one level');
      }
      // A pending comment is not a reply target — a subtree must never hang off
      // something no moderator has approved.
      if (parent.status !== 'published') {
        throw new ForbiddenError('cannot reply to a comment that is not published');
      }
    }
    // Review holds learners only; staff publish immediately. The role is read
    // once at the edge and applied here, never stored on the row.
    const status: Comment['status'] =
      config.requireReview && !actor.isStaff ? 'pending' : 'published';
    const at = this.now();
    const comment: Comment = {
      id: genId('comment'),
      orgId,
      activityId: input.activityId,
      parentId: input.parentId,
      orgUserId: actor.orgUserId,
      body: input.body,
      status,
      removedBy: null,
      createdAt: at,
      updatedAt: at,
    };
    const saved = await this.uow.run(async (scope) => {
      const row = await scope.discussion.insertComment(orgId, comment);
      await scope.outbox.append([{ type: 'comment.created', orgId, comment: row }]);
      this.logger.info('comment created', { orgId, commentId: row.id, status });
      return row;
    });
    return this.renderOne(orgId, saved, actor);
  }
```

Extend the imports at the top of `service.ts`:

```ts
import type { Comment, CommentAuthor, DiscussionSettings, ThreadState } from './model.js';
import type { PostCommentInput, ResolvedThreadConfig, ThreadComment } from './types.js';
import type {
  Actor,
  AuthorRecord,
  DiscussionRepository,
  DiscussionService,
  DiscussionUnitOfWork,
} from './ports.js';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts`
Expected: PASS, 18 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/discussion
git commit -m "feat(discussion): post comments with review gate and one-level replies"
```

---

## Task 8: Reading a thread

**Files:**
- Modify: `packages/server/src/core/discussion/service.ts`
- Modify: `packages/server/src/core/discussion/service.test.ts`

**Interfaces:**
- Consumes: `post` and `renderOne` from Task 7, `ThreadView` from `./ports.js`.
- Produces: `DiscussionServiceImpl.listThread(orgId, activityId, actor): Promise<ThreadView>`.

Rules, each needing a test:
1. **A removed comment is a placeholder only when the reader can see at least one of its replies**; otherwise it is not served at all. Whether it appears depends on what *that* reader is shown — a marker with nothing beneath it is noise.
2. A removed reply is never served: replies have no replies of their own to hold in place.
3. A pending comment is served to its own author and to staff, never to another learner.
4. The author is resolved fresh from their current role, and carries no email.
5. `removedBy` names the remover.
6. Reaction counts are grouped by emoji, with `reacted` true for the reader's own.
7. A hidden thread serves no comments.

- [ ] **Step 1: Write the failing tests**

Append to `service.test.ts`:

```ts
describe('listThread', () => {
  it('serves a removed comment as a placeholder when its reply is visible', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'bad',
    });
    await service.post('o1', staff, {
      activityId: 'a1', parentId: root.id, body: 'reply',
    });
    await service.remove('o1', root.id, staff);

    const view = await service.listThread('o1', 'a1', learner);
    const placeholder = view.comments.find((c) => c.id === root.id);
    expect(placeholder?.body).toBeNull();
    expect(placeholder?.status).toBe('removed');
    expect(placeholder?.removedBy?.id).toBe(staff.orgUserId);
    expect(view.comments).toHaveLength(2);
  });

  it('does not serve a removed comment that has no replies', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'oops',
    });
    await service.remove('o1', root.id, learner);
    const view = await service.listThread('o1', 'a1', learner);
    expect(view.comments).toHaveLength(0);
  });

  it('hides a removed comment whose only reply this reader cannot see', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const root = await service.post('o1', staff, {
      activityId: 'a1', parentId: null, body: 'root',
    });
    // The only reply is another learner's, still awaiting review.
    await service.post('o1', learner, {
      activityId: 'a1', parentId: root.id, body: 'pending reply',
    });
    await service.remove('o1', root.id, staff);

    const other: Actor = { orgUserId: 'orm_other', isStaff: false };
    const theirs = await service.listThread('o1', 'a1', other);
    expect(theirs.comments).toHaveLength(0);

    // Its author still sees both the reply and the placeholder holding it.
    const own = await service.listThread('o1', 'a1', learner);
    expect(own.comments).toHaveLength(2);
  });

  it('never serves a removed reply', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.post('o1', staff, {
      activityId: 'a1', parentId: null, body: 'root',
    });
    const reply = await service.post('o1', learner, {
      activityId: 'a1', parentId: root.id, body: 'reply',
    });
    await service.remove('o1', reply.id, learner);
    const view = await service.listThread('o1', 'a1', learner);
    expect(view.comments.map((c) => c.id)).toEqual([root.id]);
  });

  it('serves a pending comment to its author but not to another learner', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const pending = await service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'q',
    });

    const own = await service.listThread('o1', 'a1', learner);
    expect(own.comments.map((c) => c.id)).toContain(pending.id);

    const other: Actor = { orgUserId: 'orm_other', isStaff: false };
    const theirs = await service.listThread('o1', 'a1', other);
    expect(theirs.comments).toHaveLength(0);

    const moderator = await service.listThread('o1', 'a1', staff);
    expect(moderator.comments.map((c) => c.id)).toContain(pending.id);
  });

  it('resolves the author from their current role and omits their email', async () => {
    const fake = fakeRepo();
    fake.authors.set('orm_staff', {
      id: 'orm_staff', name: 'Sarah Chen', image: null, role: 'instructor',
      email: 'sarah@example.test',
    });
    const { service } = makeService(fake);
    await enabled(service);
    await service.post('o1', staff, { activityId: 'a1', parentId: null, body: 'hello' });
    const view = await service.listThread('o1', 'a1', learner);
    expect(view.comments[0]?.author).toEqual({
      id: 'orm_staff', name: 'Sarah Chen', image: null, role: 'instructor',
    });
  });

  it('flags a comment as the reader own only for its author', async () => {
    const { service } = makeService();
    await enabled(service);
    await service.post('o1', learner, { activityId: 'a1', parentId: null, body: 'mine' });
    expect((await service.listThread('o1', 'a1', learner)).comments[0]?.isOwn).toBe(true);
    expect((await service.listThread('o1', 'a1', staff)).comments[0]?.isOwn).toBe(false);
  });

  it('groups reactions by emoji and flags the reader own', async () => {
    const { service } = makeService();
    await enabled(service);
    const c = await service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'hi',
    });
    await service.react('o1', c.id, learner, '👍');
    await service.react('o1', c.id, staff, '👍');

    const view = await service.listThread('o1', 'a1', learner);
    expect(view.comments[0]?.reactions).toEqual([{ emoji: '👍', count: 2, reacted: true }]);

    const other: Actor = { orgUserId: 'orm_other', isStaff: false };
    const theirs = await service.listThread('o1', 'a1', other);
    expect(theirs.comments[0]?.reactions).toEqual([{ emoji: '👍', count: 2, reacted: false }]);
  });

  it('serves nothing for a hidden thread', async () => {
    const { service } = makeService();
    await enabled(service);
    await service.post('o1', learner, { activityId: 'a1', parentId: null, body: 'hi' });
    await service.setThreadState('o1', 'a1', 'hidden');
    const view = await service.listThread('o1', 'a1', learner);
    expect(view.comments).toHaveLength(0);
    expect(view.config.state).toBe('hidden');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts -t "listThread"`
Expected: FAIL — `service.listThread is not a function`. `remove` and `react` also do not exist yet; they arrive in Tasks 9 and 10, so most of this block stays red until then. Step 4 below runs only the two tests that need nothing else.

- [ ] **Step 3: Implement `listThread`**

Add to `DiscussionServiceImpl`:

```ts
  async listThread(orgId: string, activityId: string, actor: Actor): Promise<ThreadView> {
    const config = await this.resolveConfig(orgId, activityId);
    if (config.state === 'hidden') {
      return { config, comments: [] };
    }
    const rows = await this.repo.listByActivity(orgId, activityId);
    // A pending comment is visible to its own author and to staff, nobody else.
    const readable = rows.filter((c) => {
      if (c.status === 'published' || c.status === 'removed') {
        return true;
      }
      return actor.isStaff || c.orgUserId === actor.orgUserId;
    });
    // Replies nest one level, so a reply has nothing hanging off it — a removed
    // reply is simply dropped rather than held open as a placeholder.
    const replies = readable.filter((c) => c.parentId !== null && c.status !== 'removed');
    const heldOpen = new Set(replies.map((r) => r.parentId));
    // A removed root survives only to hold replies THIS reader can see. Judging
    // it against every reply would show a marker with nothing beneath it.
    const roots = readable.filter(
      (c) => c.parentId === null && (c.status !== 'removed' || heldOpen.has(c.id)),
    );
    const rootIds = new Set(roots.map((r) => r.id));
    const served = [...roots, ...replies.filter((r) => rootIds.has(r.parentId!))].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );

    const ids = served.map((c) => c.id);
    const people = new Set<string>();
    for (const c of served) {
      people.add(c.orgUserId);
      if (c.removedBy) {
        people.add(c.removedBy);
      }
    }
    const [reactions, authors] = await Promise.all([
      config.reactions ? this.repo.listReactions(orgId, ids) : Promise.resolve([]),
      this.repo.authorsOf(orgId, [...people]),
    ]);

    const comments = served.map((c) => {
      const own = reactions.filter((r) => r.commentId === c.id);
      const byEmoji = new Map<string, { emoji: string; count: number; reacted: boolean }>();
      for (const r of own) {
        const entry = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, reacted: false };
        entry.count += 1;
        entry.reacted ||= r.orgUserId === actor.orgUserId;
        byEmoji.set(r.emoji, entry);
      }
      const author = authors[c.orgUserId];
      const remover = c.removedBy ? authors[c.removedBy] : undefined;
      return {
        id: c.id,
        parentId: c.parentId,
        author: author
          ? this.toAuthor(author)
          : { id: c.orgUserId, name: 'Unknown', image: null, role: 'student' as const },
        isOwn: c.orgUserId === actor.orgUserId,
        body: c.status === 'removed' ? null : c.body,
        status: c.status,
        removedBy: remover ? this.toAuthor(remover) : null,
        reactions: [...byEmoji.values()].sort((a, b) => a.emoji.localeCompare(b.emoji)),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });
    return { config, comments };
  }
```

Add to the imports in `service.ts`:

```ts
import type { ThreadView } from './ports.js';
```

- [ ] **Step 4: Run the two tests that need nothing from later tasks**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts -t "current role"`
Expected: PASS, 1 passed.

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts -t "hidden thread"`
Expected: PASS, 1 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/discussion
git commit -m "feat(discussion): serve a thread with per-reader placeholder rules"
```

---

## Task 9: Edit, remove, restore and approve

**Files:**
- Modify: `packages/server/src/core/discussion/service.ts`
- Modify: `packages/server/src/core/discussion/service.test.ts`

**Interfaces:**
- Produces: `edit` returning `Promise<ThreadComment>`; `remove`, `restore`, `approve` returning `Promise<Comment>`.

Rules:
1. An author edits and removes their own comment, unbounded by time or replies.
2. Nobody else may edit; staff may remove anyone's.
3. `restore` and `approve` are staff-only.
4. `approve` emits `comment.published`; `remove` emits `comment.removed` naming the remover.

- [ ] **Step 1: Write the failing tests**

Append to `service.test.ts`:

```ts
describe('edit, remove, restore, approve', () => {
  async function published() {
    const ctx = makeService();
    await enabled(ctx.service);
    const comment = await ctx.service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'original',
    });
    return { ...ctx, comment };
  }

  it('lets an author edit their own comment', async () => {
    const { service, comment } = await published();
    const edited = await service.edit('o1', comment.id, learner, 'revised');
    expect(edited.body).toBe('revised');
    expect(edited.author.id).toBe(learner.orgUserId);
  });

  it('refuses an edit by anyone else, including staff', async () => {
    const { service, comment } = await published();
    await expect(service.edit('o1', comment.id, staff, 'nope')).rejects.toThrow(ForbiddenError);
  });

  it('lets an author remove their own comment and names them as remover', async () => {
    const { service, comment, appended } = await published();
    const removed = await service.remove('o1', comment.id, learner);
    expect(removed.status).toBe('removed');
    expect(removed.removedBy).toBe(learner.orgUserId);
    expect(appended.at(-1)).toMatchObject({
      type: 'comment.removed',
      removedBy: learner.orgUserId,
    });
  });

  it('lets staff remove another person comment', async () => {
    const { service, comment } = await published();
    const removed = await service.remove('o1', comment.id, staff);
    expect(removed.removedBy).toBe(staff.orgUserId);
  });

  it('refuses removal by an unrelated learner', async () => {
    const { service, comment } = await published();
    const other: Actor = { orgUserId: 'orm_other', isStaff: false };
    await expect(service.remove('o1', comment.id, other)).rejects.toThrow(ForbiddenError);
  });

  it('restores a removed comment to published, staff only', async () => {
    const { service, comment } = await published();
    await service.remove('o1', comment.id, staff);
    await expect(service.restore('o1', comment.id, learner)).rejects.toThrow(ForbiddenError);
    const restored = await service.restore('o1', comment.id, staff);
    expect(restored.status).toBe('published');
    expect(restored.removedBy).toBeNull();
  });

  it('approves a pending comment and emits comment.published', async () => {
    const { service, appended } = makeService();
    await enabled(service, { requireReview: true });
    const pending = await service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'q',
    });
    await expect(service.approve('o1', pending.id, learner)).rejects.toThrow(ForbiddenError);
    const approved = await service.approve('o1', pending.id, staff);
    expect(approved.status).toBe('published');
    expect(appended.at(-1)?.type).toBe('comment.published');
  });

  it('refuses to approve a comment that is not pending', async () => {
    const { service, comment } = await published();
    await expect(service.approve('o1', comment.id, staff)).rejects.toThrow(ForbiddenError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts -t "edit, remove"`
Expected: FAIL — `service.edit is not a function`.

- [ ] **Step 3: Implement the four methods**

Add to `DiscussionServiceImpl`:

```ts
  private async load(orgId: string, commentId: string): Promise<Comment> {
    const comment = await this.repo.findComment(orgId, commentId);
    if (!comment) {
      throw new NotFoundError('Comment', commentId);
    }
    return comment;
  }

  async edit(
    orgId: string,
    commentId: string,
    actor: Actor,
    body: string,
  ): Promise<ThreadComment> {
    const comment = await this.load(orgId, commentId);
    // Editing is the author's alone — moderators remove, they do not rewrite.
    if (comment.orgUserId !== actor.orgUserId) {
      throw new ForbiddenError('only the author may edit a comment');
    }
    if (comment.status === 'removed') {
      throw new ForbiddenError('a removed comment cannot be edited');
    }
    const updated = await this.repo.updateComment(orgId, commentId, {
      body,
      updatedAt: this.now(),
    });
    return this.renderOne(orgId, updated ?? comment, actor);
  }

  async remove(orgId: string, commentId: string, actor: Actor): Promise<Comment> {
    const comment = await this.load(orgId, commentId);
    if (comment.orgUserId !== actor.orgUserId && !actor.isStaff) {
      throw new ForbiddenError('only the author or a moderator may remove a comment');
    }
    if (comment.status === 'removed') {
      return comment;
    }
    return this.uow.run(async (scope) => {
      const updated = await scope.discussion.updateComment(orgId, commentId, {
        status: 'removed',
        removedBy: actor.orgUserId,
        updatedAt: this.now(),
      });
      const result = updated ?? comment;
      await scope.outbox.append([
        { type: 'comment.removed', orgId, comment: result, removedBy: actor.orgUserId },
      ]);
      this.logger.info('comment removed', { orgId, commentId, by: actor.orgUserId });
      return result;
    });
  }

  async restore(orgId: string, commentId: string, actor: Actor): Promise<Comment> {
    if (!actor.isStaff) {
      throw new ForbiddenError('only a moderator may restore a comment');
    }
    const comment = await this.load(orgId, commentId);
    if (comment.status !== 'removed') {
      return comment;
    }
    const updated = await this.repo.updateComment(orgId, commentId, {
      status: 'published',
      removedBy: null,
      updatedAt: this.now(),
    });
    return updated ?? comment;
  }

  async approve(orgId: string, commentId: string, actor: Actor): Promise<Comment> {
    if (!actor.isStaff) {
      throw new ForbiddenError('only a moderator may approve a comment');
    }
    const comment = await this.load(orgId, commentId);
    if (comment.status !== 'pending') {
      throw new ForbiddenError('only a pending comment can be approved');
    }
    return this.uow.run(async (scope) => {
      const updated = await scope.discussion.updateComment(orgId, commentId, {
        status: 'published',
        updatedAt: this.now(),
      });
      const result = updated ?? comment;
      await scope.outbox.append([{ type: 'comment.published', orgId, comment: result }]);
      this.logger.info('comment published', { orgId, commentId });
      return result;
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts -t "edit, remove"`
Expected: PASS, 8 passed.

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts -t "placeholder"`
Expected: PASS — the Task 8 removal tests now have `remove`.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/discussion
git commit -m "feat(discussion): author edit/remove plus moderator restore and approve"
```

---

## Task 10: Reactions

**Files:**
- Modify: `packages/server/src/core/discussion/service.ts`
- Modify: `packages/server/src/core/discussion/service.test.ts`

**Interfaces:**
- Produces: `react(orgId, commentId, actor, emoji): Promise<void>`, `unreact(...)` with the same signature, and the private `requireOpenThread` / `requireVisibleThread` gates that Task 11 reuses.

Rules: reactions are refused when `reactions` is off or the thread is not `visible`; reacting twice the same way is a no-op; reactions are not evented.

- [ ] **Step 1: Write the failing tests**

Append to `service.test.ts`:

```ts
describe('reactions', () => {
  async function withComment(patch = {}) {
    const ctx = makeService();
    await enabled(ctx.service, patch);
    const comment = await ctx.service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'hi',
    });
    return { ...ctx, comment };
  }

  it('is idempotent for the same person and emoji', async () => {
    const { service, comment, reactions } = await withComment();
    await service.react('o1', comment.id, learner, '👍');
    await service.react('o1', comment.id, learner, '👍');
    expect(reactions).toHaveLength(1);
  });

  it('removes a reaction', async () => {
    const { service, comment, reactions } = await withComment();
    await service.react('o1', comment.id, learner, '👍');
    await service.unreact('o1', comment.id, learner, '👍');
    expect(reactions).toHaveLength(0);
  });

  it('emits no event', async () => {
    const { service, comment, appended } = await withComment();
    const before = appended.length;
    await service.react('o1', comment.id, learner, '👍');
    expect(appended).toHaveLength(before);
  });

  it('refuses when reactions are disabled', async () => {
    const { service, comment } = await withComment({ reactions: false });
    await expect(service.react('o1', comment.id, learner, '👍')).rejects.toThrow(ForbiddenError);
  });

  it('refuses on a locked thread', async () => {
    const { service, comment } = await withComment();
    await service.setThreadState('o1', 'a1', 'locked');
    await expect(service.react('o1', comment.id, learner, '👍')).rejects.toThrow(ForbiddenError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts -t "reactions"`
Expected: FAIL — `service.react is not a function`.

- [ ] **Step 3: Implement**

Add to `DiscussionServiceImpl`:

```ts
  /** Load a comment together with its thread's resolved config. Both gates
   *  below need the pair, and neither should read the row twice. */
  private async loadWithConfig(
    orgId: string,
    commentId: string,
  ): Promise<{ comment: Comment; config: ResolvedThreadConfig }> {
    const comment = await this.load(orgId, commentId);
    const config = await this.resolveConfig(orgId, comment.activityId);
    return { comment, config };
  }

  async react(orgId: string, commentId: string, actor: Actor, emoji: string): Promise<void> {
    const { config } = await this.loadWithConfig(orgId, commentId);
    // Writing to the thread — locked and hidden both refuse.
    if (config.state !== 'visible') {
      throw new ForbiddenError('discussion is not open on this activity');
    }
    if (!config.reactions) {
      throw new ForbiddenError('reactions are disabled on this course');
    }
    await this.repo.insertReaction(orgId, {
      orgId,
      commentId,
      orgUserId: actor.orgUserId,
      emoji,
      createdAt: this.now(),
    });
  }

  async unreact(orgId: string, commentId: string, actor: Actor, emoji: string): Promise<void> {
    const { config } = await this.loadWithConfig(orgId, commentId);
    if (config.state !== 'visible') {
      throw new ForbiddenError('discussion is not open on this activity');
    }
    await this.repo.deleteReaction(orgId, commentId, actor.orgUserId, emoji);
  }
```

- [ ] **Step 4: Run the whole suite**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts`
Expected: PASS — every test, including the Task 8 reaction-grouping test.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/discussion
git commit -m "feat(discussion): reactions with idempotent add and remove"
```

---

## Task 11: Reports and the moderation queue

**Files:**
- Modify: `packages/server/src/core/discussion/service.ts`
- Modify: `packages/server/src/core/discussion/service.test.ts`

**Interfaces:**
- Produces: `report`, `resolveReports`, `queue` on `DiscussionServiceImpl`.

Rules:
1. A report never changes moderation state.
2. One report per person per comment.
3. `comment.reported` is emitted — once. A duplicate emits nothing, or a threshold automation would double-count.
4. **A locked thread still accepts reports** — an archived thread can still contain something a moderator needs to see. A hidden thread does not: its comments are not served, so nobody can be looking at one.
5. The queue scopes to a course by resolving each activity's course, and each entry carries the author, the activity title, and the reports themselves.

- [ ] **Step 1: Write the failing tests**

Append to `service.test.ts`:

```ts
describe('reports and queue', () => {
  async function withComment() {
    const ctx = makeService();
    await enabled(ctx.service);
    const comment = await ctx.service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'bad',
    });
    return { ...ctx, comment };
  }

  it('does not change the comment status', async () => {
    const { service, comment } = await withComment();
    await service.report('o1', comment.id, staff, 'abuse');
    const after = await service.listThread('o1', 'a1', staff);
    expect(after.comments[0]?.status).toBe('published');
  });

  it('emits comment.reported', async () => {
    const { service, comment, appended } = await withComment();
    await service.report('o1', comment.id, staff, 'abuse');
    expect(appended.at(-1)?.type).toBe('comment.reported');
  });

  it('is one report per person per comment and emits once', async () => {
    const { service, comment, reports, appended } = await withComment();
    await service.report('o1', comment.id, staff, 'first');
    const before = appended.length;
    await service.report('o1', comment.id, staff, 'second');
    expect(reports).toHaveLength(1);
    expect(appended).toHaveLength(before);
  });

  it('accepts a report on a locked thread', async () => {
    const { service, comment, reports } = await withComment();
    await service.setThreadState('o1', 'a1', 'locked');
    await service.report('o1', comment.id, staff, 'still bad');
    expect(reports).toHaveLength(1);
  });

  it('refuses a report on a hidden thread', async () => {
    const { service, comment } = await withComment();
    await service.setThreadState('o1', 'a1', 'hidden');
    await expect(service.report('o1', comment.id, staff, 'x')).rejects.toThrow(ForbiddenError);
  });

  it('lists a reported comment with its author, activity and reports', async () => {
    const fake = fakeRepo();
    fake.authors.set('orm_learner', {
      id: 'orm_learner', name: 'Ana Diaz', image: null, role: 'student',
      email: 'ana@example.test',
    });
    const { service, comment } = await (async () => {
      const ctx = makeService(fake);
      await enabled(ctx.service);
      const c = await ctx.service.post('o1', learner, {
        activityId: 'a1', parentId: null, body: 'bad',
      });
      return { ...ctx, comment: c };
    })();
    const other: Actor = { orgUserId: 'orm_other', isStaff: false };
    await service.report('o1', comment.id, staff, 'spam');
    await service.report('o1', comment.id, other, 'rude');

    const entries = await service.queue('o1', { kind: 'reported', courseId: 'c1' });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.comment.id).toBe(comment.id);
    expect(entries[0]?.author.name).toBe('Ana Diaz');
    expect(entries[0]?.authorEmail).toBe('ana@example.test');
    expect(entries[0]?.activityTitle).toBe('Lesson one');
    expect(entries[0]?.courseId).toBe('c1');
    expect(entries[0]?.reports.map((r) => r.reason).sort()).toEqual(['rude', 'spam']);
    expect(entries[0]?.reports[0]?.reporter.id).toBeDefined();
  });

  it('drops a comment out of the reported queue once its reports resolve', async () => {
    const { service, comment } = await withComment();
    await service.report('o1', comment.id, staff, 'a');
    await service.resolveReports('o1', comment.id, staff);
    expect(await service.queue('o1', { kind: 'reported', courseId: 'c1' })).toHaveLength(0);
  });

  it('lists pending comments in the queue', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const pending = await service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'q',
    });
    const entries = await service.queue('o1', { kind: 'pending', courseId: 'c1' });
    expect(entries.map((e) => e.comment.id)).toEqual([pending.id]);
  });

  it('scopes the queue to the requested course', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    await service.post('o1', learner, { activityId: 'a1', parentId: null, body: 'q' });
    expect(await service.queue('o1', { kind: 'pending', courseId: 'c2' })).toHaveLength(0);
    expect(await service.queue('o1', { kind: 'pending' })).toHaveLength(1);
  });

  it('refuses resolution by a learner', async () => {
    const { service, comment } = await withComment();
    await service.report('o1', comment.id, staff, 'a');
    await expect(service.resolveReports('o1', comment.id, learner)).rejects.toThrow(
      ForbiddenError,
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts -t "reports and queue"`
Expected: FAIL — `service.report is not a function`.

- [ ] **Step 3: Implement**

Add to `DiscussionServiceImpl`:

```ts
  async report(
    orgId: string,
    commentId: string,
    actor: Actor,
    reason: string,
  ): Promise<CommentReport> {
    const { config } = await this.loadWithConfig(orgId, commentId);
    // Locked accepts reports — an archived thread can still hold something a
    // moderator needs to see. Hidden does not: nothing in it is being served,
    // so nobody is looking at a comment to flag.
    if (config.state === 'hidden') {
      throw new ForbiddenError('discussion is not open on this activity');
    }
    const report: CommentReport = {
      id: genId('commentReport'),
      orgId,
      commentId,
      orgUserId: actor.orgUserId,
      reason,
      resolvedAt: null,
      createdAt: this.now(),
    };
    return this.uow.run(async (scope) => {
      const saved = await scope.discussion.insertReport(orgId, report);
      if (!saved) {
        // Already reported by this person — the existing open report stands and
        // a second event would double-count any threshold automation.
        return report;
      }
      await scope.outbox.append([{ type: 'comment.reported', orgId, report: saved }]);
      this.logger.info('comment reported', { orgId, commentId });
      return saved;
    });
  }

  async resolveReports(orgId: string, commentId: string, actor: Actor): Promise<void> {
    if (!actor.isStaff) {
      throw new ForbiddenError('only a moderator may resolve a report');
    }
    await this.load(orgId, commentId);
    await this.repo.resolveReportsFor(orgId, commentId, this.now());
  }

  async queue(orgId: string, query: QueueQuery): Promise<QueueEntry[]> {
    const rows =
      query.kind === 'pending'
        ? await this.repo.listByStatusWithContext(orgId, 'pending', query.courseId)
        : await this.repo.listReportedWithContext(orgId, query.courseId);
    if (rows.length === 0) {
      return [];
    }
    const commentIds = rows.map((r) => r.comment.id);
    const reports = await this.repo.listOpenReports(orgId, commentIds);
    // One lookup covers both the comment authors and everyone who flagged them.
    const people = new Set<string>();
    for (const r of rows) {
      people.add(r.comment.orgUserId);
    }
    for (const r of reports) {
      people.add(r.orgUserId);
    }
    const authors = await this.repo.authorsOf(orgId, [...people]);
    const unknown = { id: '', name: 'Unknown', image: null, role: 'student' as const, email: '' };

    return rows.map(({ comment, courseId, activityTitle }) => {
      const record = authors[comment.orgUserId] ?? { ...unknown, id: comment.orgUserId };
      return {
        comment,
        author: this.toAuthor(record),
        authorEmail: record.email,
        courseId,
        activityTitle,
        reports: reports
          .filter((r) => r.commentId === comment.id)
          .map((r) => ({
            reporter: this.toAuthor(authors[r.orgUserId] ?? { ...unknown, id: r.orgUserId }),
            reason: r.reason,
            createdAt: r.createdAt,
          })),
      };
    });
  }
```

Add to the imports in `service.ts`:

```ts
import type { CommentReport } from './model.js';
import type { QueueEntry, QueueQuery } from './ports.js';
```

- [ ] **Step 4: Run the whole suite, lint and typecheck**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts`
Expected: PASS, all tests.

Run: `pnpm lint && pnpm --filter @headless-lms/server typecheck`
Expected: both exit 0. `index.ts` now resolves because `service.ts` is complete.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/discussion
git commit -m "feat(discussion): reports as signals plus the moderation queue"
```

---

## Task 12: Drizzle repository

**Files:**
- Create: `packages/server/src/adapters/db/repositories/discussion.ts`

**Interfaces:**
- Consumes: `DiscussionRepository`, `AuthorRecord`, `CommentWithContext` from `../../../core/discussion/ports.js`; the tables from `../schema/discussion.js`; `activities` and `modules` from `../schema/content.js`; `orgUserProfileColumns` and `joinOrgUserProfile` from `./org-user-profile.js` (Task 2).
- Produces: `DrizzleDiscussionRepository`.

Two joins carry this repository. `authorsOf` reuses the Task 2 display join, so discussion is the third caller rather than the third copy. The activity→course resolution joins `activities → modules`, which is where the course actually lives.

- [ ] **Step 1: Confirm the activity title column**

The activity's title lives inside its opaque settings blob. Confirm the column name and type:

```bash
grep -n "settings\|title" packages/server/src/adapters/db/schema/content.ts | sed -n '1,20p'
```
Expected: `activities` has a `settings` jsonb column. If it is named differently, substitute the real name in the `activityTitleExpr` below.

- [ ] **Step 2: Write the repository**

Create `packages/server/src/adapters/db/repositories/discussion.ts`:

```ts
// discussion — Drizzle repository (implements the core outbound port).
//
// Two facts discussion does not own are resolved here rather than stored:
//   - the author's profile and current role, via the shared display join
//   - the course an activity sits in, via its module
// Both change independently of a comment, so a stored copy would go stale.
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  AuthorRecord,
  CommentWithContext,
  DiscussionRepository,
} from '../../../core/discussion/ports.js';
import type {
  Comment,
  CommentReaction,
  CommentReport,
  DiscussionSettings,
  ThreadState,
} from '../../../core/discussion/model.js';
import {
  activityThreadStates,
  commentReactions,
  commentReports,
  comments,
  discussionSettings,
} from '../schema/discussion.js';
import { activities, modules } from '../schema/content.js';
import { orgUsers } from '../schema/organizations.js';
import { orgUserProfileColumns, joinOrgUserProfile } from './org-user-profile.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

type CommentRow = typeof comments.$inferSelect;

/** The title lives in the activity's opaque settings blob; the moderation card
 *  needs it to say "Lesson 3" rather than an id. */
const activityTitleExpr = sql<string>`coalesce(${activities.settings} ->> 'title', '')`;

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    orgId: row.orgId,
    activityId: row.activityId,
    parentId: row.parentId ?? null,
    orgUserId: row.orgUserId,
    body: row.body,
    status: row.status,
    removedBy: row.removedBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toReport(row: typeof commentReports.$inferSelect): CommentReport {
  return {
    id: row.id,
    orgId: row.orgId,
    commentId: row.commentId,
    orgUserId: row.orgUserId,
    reason: row.reason,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleDiscussionRepository implements DiscussionRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async insertComment(orgId: string, comment: Comment): Promise<Comment> {
    const [row] = await this.db
      .insert(comments)
      .values({
        id: comment.id,
        orgId,
        activityId: comment.activityId,
        parentId: comment.parentId,
        orgUserId: comment.orgUserId,
        body: comment.body,
        status: comment.status,
        removedBy: comment.removedBy,
        createdAt: new Date(comment.createdAt),
        updatedAt: new Date(comment.updatedAt),
      })
      .returning();
    return toComment(row!);
  }

  async findComment(orgId: string, id: string): Promise<Comment | null> {
    const [row] = await this.db
      .select()
      .from(comments)
      .where(and(eq(comments.orgId, orgId), eq(comments.id, id)))
      .limit(1);
    return row ? toComment(row) : null;
  }

  async updateComment(
    orgId: string,
    id: string,
    patch: Partial<Pick<Comment, 'body' | 'status' | 'removedBy' | 'updatedAt'>>,
  ): Promise<Comment | null> {
    const [row] = await this.db
      .update(comments)
      .set({
        ...('body' in patch ? { body: patch.body } : {}),
        ...('status' in patch ? { status: patch.status } : {}),
        ...('removedBy' in patch ? { removedBy: patch.removedBy ?? null } : {}),
        ...('updatedAt' in patch && patch.updatedAt
          ? { updatedAt: new Date(patch.updatedAt) }
          : {}),
      })
      .where(and(eq(comments.orgId, orgId), eq(comments.id, id)))
      .returning();
    return row ? toComment(row) : null;
  }

  async listByActivity(orgId: string, activityId: string): Promise<Comment[]> {
    const rows = await this.db
      .select()
      .from(comments)
      .where(and(eq(comments.orgId, orgId), eq(comments.activityId, activityId)))
      .orderBy(comments.createdAt);
    return rows.map(toComment);
  }

  async listReactions(orgId: string, commentIds: string[]): Promise<CommentReaction[]> {
    if (commentIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(commentReactions)
      .where(
        and(eq(commentReactions.orgId, orgId), inArray(commentReactions.commentId, commentIds)),
      );
    return rows.map((r) => ({
      orgId: r.orgId,
      commentId: r.commentId,
      orgUserId: r.orgUserId,
      emoji: r.emoji,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async insertReaction(orgId: string, reaction: CommentReaction): Promise<void> {
    await this.db
      .insert(commentReactions)
      .values({
        orgId,
        commentId: reaction.commentId,
        orgUserId: reaction.orgUserId,
        emoji: reaction.emoji,
        createdAt: new Date(reaction.createdAt),
      })
      .onConflictDoNothing();
  }

  async deleteReaction(
    orgId: string,
    commentId: string,
    orgUserId: string,
    emoji: string,
  ): Promise<void> {
    await this.db
      .delete(commentReactions)
      .where(
        and(
          eq(commentReactions.orgId, orgId),
          eq(commentReactions.commentId, commentId),
          eq(commentReactions.orgUserId, orgUserId),
          eq(commentReactions.emoji, emoji),
        ),
      );
  }

  async insertReport(orgId: string, report: CommentReport): Promise<CommentReport | null> {
    const [row] = await this.db
      .insert(commentReports)
      .values({
        id: report.id,
        orgId,
        commentId: report.commentId,
        orgUserId: report.orgUserId,
        reason: report.reason,
        resolvedAt: report.resolvedAt ? new Date(report.resolvedAt) : null,
        createdAt: new Date(report.createdAt),
      })
      .onConflictDoNothing()
      .returning();
    return row ? toReport(row) : null;
  }

  async listOpenReports(orgId: string, commentIds: string[]): Promise<CommentReport[]> {
    if (commentIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(commentReports)
      .where(
        and(
          eq(commentReports.orgId, orgId),
          inArray(commentReports.commentId, commentIds),
          isNull(commentReports.resolvedAt),
        ),
      )
      .orderBy(commentReports.createdAt);
    return rows.map(toReport);
  }

  async resolveReportsFor(
    orgId: string,
    commentId: string,
    resolvedAt: string,
  ): Promise<void> {
    await this.db
      .update(commentReports)
      .set({ resolvedAt: new Date(resolvedAt) })
      .where(
        and(
          eq(commentReports.orgId, orgId),
          eq(commentReports.commentId, commentId),
          isNull(commentReports.resolvedAt),
        ),
      );
  }

  async findSettings(orgId: string, courseId: string): Promise<DiscussionSettings | null> {
    const [row] = await this.db
      .select()
      .from(discussionSettings)
      .where(and(eq(discussionSettings.orgId, orgId), eq(discussionSettings.courseId, courseId)))
      .limit(1);
    return row ?? null;
  }

  async upsertSettings(orgId: string, settings: DiscussionSettings): Promise<DiscussionSettings> {
    const [row] = await this.db
      .insert(discussionSettings)
      .values({
        orgId,
        courseId: settings.courseId,
        enabled: settings.enabled,
        threaded: settings.threaded,
        requireReview: settings.requireReview,
        reactions: settings.reactions,
      })
      .onConflictDoUpdate({
        target: [discussionSettings.orgId, discussionSettings.courseId],
        set: {
          enabled: settings.enabled,
          threaded: settings.threaded,
          requireReview: settings.requireReview,
          reactions: settings.reactions,
        },
      })
      .returning();
    return row!;
  }

  async findThreadState(orgId: string, activityId: string): Promise<ThreadState | null> {
    const [row] = await this.db
      .select()
      .from(activityThreadStates)
      .where(
        and(
          eq(activityThreadStates.orgId, orgId),
          eq(activityThreadStates.activityId, activityId),
        ),
      )
      .limit(1);
    return row?.state ?? null;
  }

  async listThreadStatesByCourse(
    orgId: string,
    courseId: string,
  ): Promise<Record<string, ThreadState>> {
    const rows = await this.db
      .select({ activityId: activityThreadStates.activityId, state: activityThreadStates.state })
      .from(activityThreadStates)
      .innerJoin(
        activities,
        and(
          eq(activities.orgId, activityThreadStates.orgId),
          eq(activities.id, activityThreadStates.activityId),
        ),
      )
      .innerJoin(
        modules,
        and(eq(modules.orgId, activities.orgId), eq(modules.id, activities.moduleId)),
      )
      .where(and(eq(activityThreadStates.orgId, orgId), eq(modules.courseId, courseId)));
    return Object.fromEntries(rows.map((r) => [r.activityId, r.state]));
  }

  async upsertThreadState(
    orgId: string,
    activityId: string,
    state: ThreadState,
  ): Promise<void> {
    await this.db
      .insert(activityThreadStates)
      .values({ orgId, activityId, state })
      .onConflictDoUpdate({
        target: [activityThreadStates.orgId, activityThreadStates.activityId],
        set: { state },
      });
  }

  async clearThreadState(orgId: string, activityId: string): Promise<void> {
    await this.db
      .delete(activityThreadStates)
      .where(
        and(
          eq(activityThreadStates.orgId, orgId),
          eq(activityThreadStates.activityId, activityId),
        ),
      );
  }

  async courseOfActivity(orgId: string, activityId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ courseId: modules.courseId })
      .from(activities)
      .innerJoin(
        modules,
        and(eq(modules.orgId, activities.orgId), eq(modules.id, activities.moduleId)),
      )
      .where(and(eq(activities.orgId, orgId), eq(activities.id, activityId)))
      .limit(1);
    return row?.courseId ?? null;
  }

  /** The queue's one join: comments to their activity to its module, which is
   *  where the course lives. Scoping and the card's activity title come from
   *  the same pass. */
  private async withContext(
    predicate: ReturnType<typeof and>,
    courseId?: string,
  ): Promise<CommentWithContext[]> {
    const rows = await this.db
      .select({
        comment: comments,
        courseId: modules.courseId,
        activityTitle: activityTitleExpr,
      })
      .from(comments)
      .innerJoin(
        activities,
        and(eq(activities.orgId, comments.orgId), eq(activities.id, comments.activityId)),
      )
      .innerJoin(
        modules,
        and(eq(modules.orgId, activities.orgId), eq(modules.id, activities.moduleId)),
      )
      .where(and(predicate, ...(courseId ? [eq(modules.courseId, courseId)] : [])))
      .orderBy(comments.createdAt);
    return rows.map((r) => ({
      comment: toComment(r.comment),
      courseId: r.courseId,
      activityTitle: r.activityTitle,
    }));
  }

  listByStatusWithContext(
    orgId: string,
    status: Comment['status'],
    courseId?: string,
  ): Promise<CommentWithContext[]> {
    return this.withContext(and(eq(comments.orgId, orgId), eq(comments.status, status)), courseId);
  }

  listReportedWithContext(orgId: string, courseId?: string): Promise<CommentWithContext[]> {
    return this.withContext(
      and(
        eq(comments.orgId, orgId),
        sql`exists (
          select 1 from ${commentReports} r
          where r.org_id = ${comments.orgId}
            and r.comment_id = ${comments.id}
            and r.resolved_at is null
        )`,
      ),
      courseId,
    );
  }

  async authorsOf(orgId: string, orgUserIds: string[]): Promise<Record<string, AuthorRecord>> {
    if (orgUserIds.length === 0) {
      return {};
    }
    const rows = await joinOrgUserProfile(
      this.db
        .select({ ...orgUserProfileColumns, role: orgUsers.role })
        .from(orgUsers),
    ).where(and(eq(orgUsers.orgId, orgId), inArray(orgUsers.id, orgUserIds)));
    return Object.fromEntries(
      rows.map((r) => [
        r.id,
        { id: r.id, name: r.name, image: r.image ?? null, role: r.role, email: r.email },
      ]),
    );
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @headless-lms/server typecheck`
Expected: exits 0.

If `joinOrgUserProfile`'s generic signature rejects the builder here, drop the helper for this one call and write the two `leftJoin` lines inline against `users` and `user` — matching `repositories/members.ts` exactly — rather than loosening the helper's types.

- [ ] **Step 4: Lint and commit**

Run: `pnpm lint`
Expected: exits 0.

```bash
git add packages/server/src/adapters/db/repositories/discussion.ts
git commit -m "feat(discussion): add the Drizzle repository"
```

---

## Task 13: Container wiring

**Files:**
- Modify: `packages/server/src/app/container.ts`

**Interfaces:**
- Consumes: `DiscussionServiceImpl` from `../core/discussion/index.js`, `DrizzleDiscussionRepository` from `../adapters/db/repositories/discussion.js`.
- Produces: `container.discussion: DiscussionServiceImpl`.

- [ ] **Step 1: Add the imports**

Beside the other core service imports (around line 30):

```ts
import { DiscussionServiceImpl } from '../core/discussion/index.js';
```

Beside the other repository imports (around line 44):

```ts
import { DrizzleDiscussionRepository } from '../adapters/db/repositories/discussion.js';
```

- [ ] **Step 2: Add the field to the Container interface**

Next to `progress: ProgressServiceImpl;` (around line 164):

```ts
  discussion: DiscussionServiceImpl;
```

- [ ] **Step 3: Construct it**

Read the progress block first (around lines 285-300) and copy its exact shape — in particular how `DrizzleOutboxAppender` is constructed, which may take arguments this snippet omits. Then add after it:

```ts
  // Discussion: comment writes + outbox append in one tx.
  const discussionLogger = logger.child({ name: 'discussion' });
  const discussionUow = new DrizzleUnitOfWork(db, (tx) => ({
    discussion: new DrizzleDiscussionRepository(tx, discussionLogger),
    outbox: new DrizzleOutboxAppender(tx),
  }));
  const discussion = new DiscussionServiceImpl(
    new DrizzleDiscussionRepository(db, discussionLogger),
    discussionUow,
    () => new Date().toISOString(),
    discussionLogger,
  );
```

Then add `discussion,` to both object literals that currently list `progress,` (around lines 318 and 412).

- [ ] **Step 4: Typecheck, lint, test**

Run: `pnpm --filter @headless-lms/server typecheck && pnpm lint && pnpm test`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/app/container.ts
git commit -m "feat(discussion): wire the service into the container"
```

---

## Task 14: API contract

**Files:**
- Create: `packages/api-contract/src/discussion.ts`
- Modify: `packages/api-contract/src/index.ts`

**Interfaces:**
- Consumes: `OrgUserProfileSchema` and `OrgRole` from `./shared.js` (Task 1).
- Produces: `CommentAuthor`, `ThreadComment`, `ThreadView`, `PostComment`, `EditComment`, `ReactToComment`, `ReportComment`, `Comment`, `DiscussionSettings`, `SetDiscussionSettings`, `SetThreadState`, `ThreadStates`, `ModerationQueue`, `ModerationQueueQuery`, `DiscussionActivityParam`, `CommentIdParam`, `DiscussionCourseParam` Zod schemas.

- [ ] **Step 1: Write the schemas**

Create `packages/api-contract/src/discussion.ts`:

```ts
// Discussion resource schemas. A thread attaches to an activity; settings are
// per course with an optional per-activity thread state.
//
// The author is the participation's profile minus its email — learners read each
// other's comments and the thread must not be a directory of the cohort's
// addresses. The moderation queue carries `authorEmail` separately.
import { z } from "zod";
import { OrgRole, OrgUserProfileSchema } from "./shared.js";

export const CommentStatus = z.enum(["pending", "published", "removed"]);
export type CommentStatus = z.infer<typeof CommentStatus>;

export const ThreadState = z.enum(["visible", "hidden", "locked"]);
export type ThreadState = z.infer<typeof ThreadState>;

export const CommentAuthor = OrgUserProfileSchema.omit({ email: true }).extend({
  role: OrgRole,
});
export type CommentAuthor = z.infer<typeof CommentAuthor>;

export const ReactionSummary = z.object({
  emoji: z.string(),
  count: z.number().int(),
  /** True when the requesting person is one of the reactors. */
  reacted: z.boolean(),
});
export type ReactionSummary = z.infer<typeof ReactionSummary>;

export const ThreadComment = z.object({
  id: z.string(),
  /** null = a root comment. Replies nest one level. */
  parentId: z.string().nullable(),
  author: CommentAuthor,
  /** True when the reader wrote it. Resolved server-side — the client never
   *  learns its own org_users.id. */
  isOwn: z.boolean(),
  /** null for a removed comment — the placeholder carries removedBy instead. */
  body: z.string().nullable(),
  status: CommentStatus,
  /** Who removed it. null unless removed. */
  removedBy: CommentAuthor.nullable(),
  reactions: z.array(ReactionSummary),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ThreadComment = z.infer<typeof ThreadComment>;

export const ResolvedThreadConfig = z.object({
  enabled: z.boolean(),
  threaded: z.boolean(),
  requireReview: z.boolean(),
  reactions: z.boolean(),
  state: ThreadState,
});
export type ResolvedThreadConfig = z.infer<typeof ResolvedThreadConfig>;

export const ThreadView = z.object({
  config: ResolvedThreadConfig,
  comments: z.array(ThreadComment),
});
export type ThreadView = z.infer<typeof ThreadView>;

export const PostComment = z.object({
  body: z.string().min(1).max(10_000),
  parentId: z.string().nullable().default(null),
});
export type PostComment = z.infer<typeof PostComment>;

export const EditComment = z.object({
  body: z.string().min(1).max(10_000),
});
export type EditComment = z.infer<typeof EditComment>;

export const ReactToComment = z.object({
  emoji: z.string().min(1).max(16),
});
export type ReactToComment = z.infer<typeof ReactToComment>;

export const ReportComment = z.object({
  reason: z.string().max(1_000).default(""),
});
export type ReportComment = z.infer<typeof ReportComment>;

/** The stored row. No courseId — which course an activity sits in is content's
 *  fact, resolved at read time. */
export const Comment = z.object({
  id: z.string(),
  activityId: z.string(),
  parentId: z.string().nullable(),
  orgUserId: z.string(),
  body: z.string(),
  status: CommentStatus,
  removedBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Comment = z.infer<typeof Comment>;

export const CommentReport = z.object({
  id: z.string(),
  commentId: z.string(),
  orgUserId: z.string(),
  reason: z.string(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type CommentReport = z.infer<typeof CommentReport>;

export const DiscussionSettings = z.object({
  orgId: z.string(),
  courseId: z.string(),
  enabled: z.boolean(),
  threaded: z.boolean(),
  requireReview: z.boolean(),
  reactions: z.boolean(),
});
export type DiscussionSettings = z.infer<typeof DiscussionSettings>;

export const SetDiscussionSettings = z.object({
  enabled: z.boolean().optional(),
  threaded: z.boolean().optional(),
  requireReview: z.boolean().optional(),
  reactions: z.boolean().optional(),
});
export type SetDiscussionSettings = z.infer<typeof SetDiscussionSettings>;

export const SetThreadState = z.object({
  /** null clears the override so the course setting applies again. */
  state: ThreadState.nullable(),
});
export type SetThreadState = z.infer<typeof SetThreadState>;

/** Explicit overrides only, keyed by activity id. An activity that is absent
 *  inherits its course setting. */
export const ThreadStates = z.object({
  states: z.record(z.string(), ThreadState),
});
export type ThreadStates = z.infer<typeof ThreadStates>;

export const QueueReport = z.object({
  reporter: CommentAuthor,
  reason: z.string(),
  createdAt: z.string(),
});
export type QueueReport = z.infer<typeof QueueReport>;

export const QueueEntry = z.object({
  comment: Comment,
  author: CommentAuthor,
  /** Staff-scoped surface only. Identifying a spam account is the decision. */
  authorEmail: z.string(),
  courseId: z.string(),
  activityTitle: z.string(),
  reports: z.array(QueueReport),
});
export type QueueEntry = z.infer<typeof QueueEntry>;

export const ModerationQueue = z.object({
  entries: z.array(QueueEntry),
});
export type ModerationQueue = z.infer<typeof ModerationQueue>;

export const ModerationQueueQuery = z.object({
  kind: z.enum(["pending", "reported"]),
  courseId: z.string().optional(),
});
export type ModerationQueueQuery = z.infer<typeof ModerationQueueQuery>;

export const DiscussionActivityParam = z.object({ activityId: z.string() });
export type DiscussionActivityParam = z.infer<typeof DiscussionActivityParam>;

export const CommentIdParam = z.object({ commentId: z.string() });
export type CommentIdParam = z.infer<typeof CommentIdParam>;

export const DiscussionCourseParam = z.object({ courseId: z.string() });
export type DiscussionCourseParam = z.infer<typeof DiscussionCourseParam>;
```

`DiscussionSettings` includes `orgId` because the service returns it and Fastify validates responses.

- [ ] **Step 2: Export from the barrel**

In `packages/api-contract/src/index.ts`, add:

```ts
export * from "./discussion.js";
```

- [ ] **Step 3: Check for export collisions**

`Comment`, `CommentAuthor`, `CommentReport`, `ThreadState` and `QueueEntry` are new top-level names:

```bash
grep -rn "export const \(Comment\|CommentAuthor\|CommentReport\|ThreadState\|QueueEntry\)\b" packages/api-contract/src/
```
Expected: only `discussion.ts`. If another file collides, prefix the discussion one (`DiscussionComment`) and update Task 15's route imports to match.

- [ ] **Step 4: Typecheck and commit**

Run: `pnpm --filter @headless-lms/api-contract typecheck && pnpm lint`
Expected: both exit 0.

```bash
git add packages/api-contract/src
git commit -m "feat(discussion): add the API contract schemas"
```

---

## Task 15: HTTP routes

**Files:**
- Create: `packages/server/src/http/routes/discussion.ts`
- Modify: `packages/server/src/http/routes.ts`

**Interfaces:**
- Consumes: `container.discussion`, `resolveScope` from `../scope.js`, `resolveStudentScope` from `../student-scope.js`, `container.content`, `container.reporting.learn`.
- Produces: `discussionRoutes(app, container)`.

**The access gate.** `core/discussion` never calls entitlements — the gate lives here, exactly as `routes/learn.ts` does for `reportProgress`: resolve activity → module → course, then `learn.getCourse(orgId, orgUserId, courseId)`, which returns null unless the person is enrolled. Read `packages/server/src/http/routes/learn.ts:144-164` before writing this task and copy that shape. The gate still resolves the course for the entitlement check; it no longer hands it to the service, which resolves its own.

**Staff standing.** Learner routes build `{ isStaff: false }`; moderator routes build `{ isStaff: scope.role !== 'student' }` from the session's active-org role. That is the "read fresh, never stored" rule in practice.

- [ ] **Step 1: Write the routes**

Create `packages/server/src/http/routes/discussion.ts`:

```ts
// HTTP routes for discussion. Two audiences on one domain service:
//   - learner routes resolve a student scope and gate on enrollment
//   - moderator routes resolve a staff scope; the domain enforces the rest
// The `Actor` handed to the service carries staff standing resolved here from
// the session's active-org role — core never looks a role up to authorise.
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Comment,
  CommentIdParam,
  CommentReport,
  DiscussionActivityParam,
  DiscussionCourseParam,
  DiscussionSettings,
  EditComment,
  ErrorBody,
  ModerationQueue,
  ModerationQueueQuery,
  PostComment,
  ReactToComment,
  ReportComment,
  SetDiscussionSettings,
  SetThreadState,
  ThreadComment,
  ThreadStates,
  ThreadView,
} from '@headless-lms/api-contract';
import { NotFoundError } from '../../core/shared/errors.js';
import type { Container } from '../../app/container.js';
import type { Actor } from '../../core/discussion/index.js';
import { resolveScope } from '../scope.js';
import { resolveStudentScope } from '../student-scope.js';

/** Resolve an activity to its course, then assert the person is enrolled.
 *  Mirrors routes/learn.ts — a 404 for content they cannot open. */
async function gate(
  container: Container,
  orgId: string,
  orgUserId: string,
  activityId: string,
): Promise<void> {
  const activity = await container.content.getActivity(orgId, activityId);
  const module = activity && (await container.content.getModule(orgId, activity.moduleId));
  if (!module) {
    throw new NotFoundError('Activity', activityId);
  }
  const course = await container.reporting.learn.getCourse(orgId, orgUserId, module.courseId);
  if (!course) {
    throw new NotFoundError('Activity', activityId);
  }
}

/** The comment must belong to an activity this learner may open. */
async function gateComment(
  container: Container,
  orgId: string,
  orgUserId: string,
  commentId: string,
): Promise<void> {
  const comment = await container.discussion.findCommentForGate(orgId, commentId);
  if (!comment) {
    throw new NotFoundError('Comment', commentId);
  }
  await gate(container, orgId, orgUserId, comment.activityId);
}

export async function discussionRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const discussion = container.discussion;

  // --- learner surface -------------------------------------------------------

  r.route({
    method: 'GET',
    url: '/api/learn/activities/:activityId/thread',
    schema: {
      operationId: 'getActivityThread',
      tags: ['Discussion'],
      summary: "Read an activity's comment thread",
      params: DiscussionActivityParam,
      response: { 200: ThreadView, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      await gate(container, scope.orgId, scope.orgUserId, req.params.activityId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
      return discussion.listThread(scope.orgId, req.params.activityId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/learn/activities/:activityId/comments',
    schema: {
      operationId: 'postComment',
      tags: ['Discussion'],
      summary: 'Post a comment or reply on an activity',
      params: DiscussionActivityParam,
      body: PostComment,
      response: { 200: ThreadComment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      await gate(container, scope.orgId, scope.orgUserId, req.params.activityId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
      return discussion.post(scope.orgId, actor, {
        activityId: req.params.activityId,
        parentId: req.body.parentId,
        body: req.body.body,
      });
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/learn/comments/:commentId',
    schema: {
      operationId: 'editComment',
      tags: ['Discussion'],
      summary: 'Revise your own comment',
      params: CommentIdParam,
      body: EditComment,
      response: { 200: ThreadComment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      await gateComment(container, scope.orgId, scope.orgUserId, req.params.commentId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
      return discussion.edit(scope.orgId, req.params.commentId, actor, req.body.body);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/learn/comments/:commentId',
    schema: {
      operationId: 'removeOwnComment',
      tags: ['Discussion'],
      summary: 'Remove your own comment',
      params: CommentIdParam,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      await gateComment(container, scope.orgId, scope.orgUserId, req.params.commentId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
      return discussion.remove(scope.orgId, req.params.commentId, actor);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/learn/comments/:commentId/reactions',
    schema: {
      operationId: 'reactToComment',
      tags: ['Discussion'],
      summary: 'Add a reaction to a comment',
      params: CommentIdParam,
      body: ReactToComment,
      response: { 204: { type: 'null' }, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveStudentScope(container, req);
      await gateComment(container, scope.orgId, scope.orgUserId, req.params.commentId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
      await discussion.react(scope.orgId, req.params.commentId, actor, req.body.emoji);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/learn/comments/:commentId/reactions',
    schema: {
      operationId: 'unreactToComment',
      tags: ['Discussion'],
      summary: 'Remove your reaction from a comment',
      params: CommentIdParam,
      body: ReactToComment,
      response: { 204: { type: 'null' }, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveStudentScope(container, req);
      await gateComment(container, scope.orgId, scope.orgUserId, req.params.commentId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
      await discussion.unreact(scope.orgId, req.params.commentId, actor, req.body.emoji);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/learn/comments/:commentId/reports',
    schema: {
      operationId: 'reportComment',
      tags: ['Discussion'],
      summary: 'Flag a comment for moderator attention',
      params: CommentIdParam,
      body: ReportComment,
      response: { 200: CommentReport, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      await gateComment(container, scope.orgId, scope.orgUserId, req.params.commentId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
      return discussion.report(scope.orgId, req.params.commentId, actor, req.body.reason);
    },
  });

  // --- moderator surface -----------------------------------------------------

  r.route({
    method: 'GET',
    url: '/api/discussion/queue',
    schema: {
      operationId: 'getModerationQueue',
      tags: ['Discussion'],
      summary: 'List comments awaiting review or carrying unresolved reports',
      querystring: ModerationQueueQuery,
      response: { 200: ModerationQueue },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const entries = await discussion.queue(scope.orgId, {
        kind: req.query.kind,
        courseId: req.query.courseId,
      });
      return { entries };
    },
  });

  r.route({
    method: 'POST',
    url: '/api/discussion/comments/:commentId/approve',
    schema: {
      operationId: 'approveComment',
      tags: ['Discussion'],
      summary: 'Publish a comment awaiting review',
      params: CommentIdParam,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: scope.role !== 'student' };
      return discussion.approve(scope.orgId, req.params.commentId, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/discussion/comments/:commentId',
    schema: {
      operationId: 'moderateRemoveComment',
      tags: ['Discussion'],
      summary: 'Remove a comment as a moderator',
      params: CommentIdParam,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: scope.role !== 'student' };
      return discussion.remove(scope.orgId, req.params.commentId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/discussion/comments/:commentId/restore',
    schema: {
      operationId: 'restoreComment',
      tags: ['Discussion'],
      summary: 'Restore a removed comment',
      params: CommentIdParam,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: scope.role !== 'student' };
      return discussion.restore(scope.orgId, req.params.commentId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/discussion/comments/:commentId/resolve-reports',
    schema: {
      operationId: 'resolveCommentReports',
      tags: ['Discussion'],
      summary: 'Dismiss every open report on a comment',
      params: CommentIdParam,
      response: { 204: { type: 'null' }, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: scope.role !== 'student' };
      await discussion.resolveReports(scope.orgId, req.params.commentId, actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/discussion/courses/:courseId/settings',
    schema: {
      operationId: 'getDiscussionSettings',
      tags: ['Discussion'],
      summary: "Read a course's discussion settings",
      params: DiscussionCourseParam,
      response: { 200: DiscussionSettings },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return discussion.getSettings(scope.orgId, req.params.courseId);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/discussion/courses/:courseId/settings',
    schema: {
      operationId: 'setDiscussionSettings',
      tags: ['Discussion'],
      summary: "Update a course's discussion settings",
      params: DiscussionCourseParam,
      body: SetDiscussionSettings,
      response: { 200: DiscussionSettings },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return discussion.setSettings(scope.orgId, req.params.courseId, req.body);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/discussion/courses/:courseId/thread-states',
    schema: {
      operationId: 'getThreadStates',
      tags: ['Discussion'],
      summary: "Read every per-activity thread-state override in a course",
      params: DiscussionCourseParam,
      response: { 200: ThreadStates },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const states = await discussion.listThreadStates(scope.orgId, req.params.courseId);
      return { states };
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/discussion/activities/:activityId/thread-state',
    schema: {
      operationId: 'setActivityThreadState',
      tags: ['Discussion'],
      summary: "Override or clear an activity's thread state",
      params: DiscussionActivityParam,
      body: SetThreadState,
      response: { 204: { type: 'null' } },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await discussion.setThreadState(scope.orgId, req.params.activityId, req.body.state);
      return reply.code(204).send();
    },
  });
}
```

- [ ] **Step 2: Add the gate lookup to the service**

`gateComment` needs the comment's activity before the domain runs its own checks. Add to `DiscussionService` in `ports.ts`:

```ts
  /** Read-only lookup for the HTTP entitlement gate — no rules applied. */
  findCommentForGate(orgId: string, commentId: string): Promise<Comment | null>;
```

and to `DiscussionServiceImpl` in `service.ts`:

```ts
  findCommentForGate(orgId: string, commentId: string): Promise<Comment | null> {
    return this.repo.findComment(orgId, commentId);
  }
```

- [ ] **Step 3: Register**

In `packages/server/src/http/routes.ts`, add the import beside the others:

```ts
import { discussionRoutes } from './routes/discussion.js';
```

and inside the session-guarded plugin, after `await learnRoutes(instance, container);`:

```ts
    await discussionRoutes(instance, container);
```

- [ ] **Step 4: Typecheck, lint, test**

Run: `pnpm --filter @headless-lms/server typecheck && pnpm lint && pnpm test`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/http packages/server/src/core/discussion
git commit -m "feat(discussion): add learner and moderator HTTP routes"
```

---

## Task 16: Regenerate the SDK

**Files:**
- Modify: `packages/sdk/openapi.json` (generated)
- Modify: `packages/sdk/src/generated/**` (generated)

This regeneration carries both the discussion resource and the Task 2 person-shape change, so the `Member` and `Student` types in the SDK move too.

- [ ] **Step 1: Start the database**

`gen:openapi` boots the real app, so Postgres must be up.

Run: `docker compose -f docker/docker-compose.yml up -d`
Expected: the postgres container is running.

- [ ] **Step 2: Generate**

Run: `pnpm gen:sdk`
Expected: exits 0; `packages/sdk/openapi.json` and `packages/sdk/src/generated/` change.

- [ ] **Step 3: Verify the Discussion class and the moved person shape**

```bash
grep -rn "class Discussion" packages/sdk/src/generated/ | head
grep -c "getActivityThread\|postComment\|getModerationQueue\|getThreadStates" packages/sdk/src/generated/*.ts
grep -rn "authorIsStaff\|orgUserId: string" packages/sdk/src/generated/types.gen.ts | head
```
Expected: a `Discussion` class; all four operation ids present; **no** `authorIsStaff` anywhere.

- [ ] **Step 4: Full verification**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
Expected: all four exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk
git commit -m "feat(discussion): regenerate OpenAPI spec and SDK"
```

---

## Task 17: Drop the apps' local person copies

**Files:**
- Modify: `apps/admin/src/lib/api/types.ts:120-127`
- Modify: `apps/admin/src/lib/auth/server-session.ts:28`, `:54`
- Modify: `apps/student/src/lib/auth/server-session.ts:26-27`, `:39`

**Interfaces:**
- Consumes: the regenerated SDK types from Task 16.

Four of the ten declarations live in the apps. Now that the SDK carries the shape, they alias it instead of restating it.

- [ ] **Step 1: Alias in the admin app**

In `apps/admin/src/lib/api/types.ts`, replace the `SessionUser` interface:

```ts
/** The session's person plus the admin-session concerns that belong nowhere
 *  else. `id` is the auth user id, not org_users.id. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  /** Active org role + the courses an instructor is scoped to. */
  role: Role;
  scopedCourseIds: string[];
}
```

`image` loses its `?` — the server now always sends it.

In `apps/admin/src/lib/auth/server-session.ts`, define the user shape once at line 28 and reuse it for the parse at line 54:

```ts
type SessionPerson = { id: string; name: string; email: string; image: string | null };
```

Use `SessionPerson` in both the `ServerSession` interface and the response-parsing type, keeping the `?? null` at line 116.

- [ ] **Step 2: Alias in the student app**

In `apps/student/src/lib/auth/server-session.ts`, apply the same change: one `SessionPerson` type used by both the `ServerSession` interface (line 26-27) and the parse shape (line 39), keeping the `?? null` normalisation.

- [ ] **Step 3: Typecheck, lint and build both apps**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0. Any error is a call site that relied on `image` being possibly-absent.

Run: `pnpm --filter @headless-lms/admin build && pnpm --filter @headless-lms/student build`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src apps/student/src
git commit -m "refactor: alias the shared person shape in both apps"
```

---

## Task 18: Student thread — the pure core

**Files:**
- Create: `apps/student/src/components/player/discussion/thread-state.ts`
- Create: `apps/student/src/components/player/discussion/thread-state.test.ts`

**Interfaces:**
- Consumes: `ThreadComment`, `ThreadView`, `ResolvedThreadConfig` from `@headless-lms/sdk`.
- Produces: `ThreadPanelState`, `initialThreadState`, `ThreadAction`, `threadReducer`, `ThreadNode`, `groupThread`, `permissions`, `canPost`. The reducer's state is named `ThreadPanelState` rather than `ThreadState` — the SDK already exports `ThreadState` for visible/hidden/locked, and two meanings under one name in the same folder is a bug waiting to happen. Task 19's hook and components consume all of them.

Everything that can be tested without React lives here: grouping, the per-reader placeholder rule mirrored client-side, optimistic transitions with rollback, and which actions a comment offers. `apps/student/src/lib/video-tracking.test.ts` is the precedent for testing the player's stateful logic this way.

- [ ] **Step 1: Write the failing test**

Create `apps/student/src/components/player/discussion/thread-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ThreadComment, ResolvedThreadConfig } from "@headless-lms/sdk";
import {
  groupThread,
  initialThreadState,
  permissions,
  threadReducer,
} from "./thread-state";

const author = { id: "orm_a", name: "Ana Diaz", image: null, role: "student" as const };
const instructor = { id: "orm_s", name: "Sarah Chen", image: null, role: "instructor" as const };

function comment(over: Partial<ThreadComment> = {}): ThreadComment {
  return {
    id: "cmt_1",
    parentId: null,
    author,
    isOwn: false,
    body: "hello",
    status: "published",
    removedBy: null,
    reactions: [],
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    ...over,
  };
}

const open: ResolvedThreadConfig = {
  enabled: true,
  threaded: true,
  requireReview: false,
  reactions: true,
  state: "visible",
};

describe("groupThread", () => {
  it("nests replies under their root, one level deep", () => {
    const root = comment({ id: "r1" });
    const reply = comment({ id: "p1", parentId: "r1" });
    const nodes = groupThread([root, reply]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.comment.id).toBe("r1");
    expect(nodes[0]?.replies.map((r) => r.id)).toEqual(["p1"]);
  });

  it("keeps a removed root that still has a visible reply", () => {
    const root = comment({ id: "r1", status: "removed", body: null, removedBy: instructor });
    const reply = comment({ id: "p1", parentId: "r1" });
    expect(groupThread([root, reply])).toHaveLength(1);
  });

  it("drops a removed root with no visible replies", () => {
    const root = comment({ id: "r1", status: "removed", body: null, removedBy: instructor });
    expect(groupThread([root])).toHaveLength(0);
  });

  it("never renders a removed reply", () => {
    const root = comment({ id: "r1" });
    const reply = comment({ id: "p1", parentId: "r1", status: "removed", body: null });
    expect(groupThread([root, reply])[0]?.replies).toHaveLength(0);
  });

  it("drops a reply whose root is gone", () => {
    expect(groupThread([comment({ id: "p1", parentId: "missing" })])).toHaveLength(0);
  });
});

describe("permissions", () => {
  it("offers reply, react, edit and remove on an open thread", () => {
    const p = permissions(open, comment({ isOwn: true }));
    expect(p).toMatchObject({
      canReply: true,
      canReact: true,
      canEdit: true,
      canRemove: true,
      canReport: false,
    });
  });

  it("offers report on someone else's comment, never on your own", () => {
    expect(permissions(open, comment({ isOwn: false })).canReport).toBe(true);
    expect(permissions(open, comment({ isOwn: true })).canReport).toBe(false);
  });

  it("keeps reporting available on a locked thread and nothing else", () => {
    const locked = { ...open, state: "locked" as const };
    const p = permissions(locked, comment());
    expect(p.canReport).toBe(true);
    expect(p.canReply).toBe(false);
    expect(p.canReact).toBe(false);
  });

  it("lets an author still remove their own comment on a locked thread", () => {
    const locked = { ...open, state: "locked" as const };
    expect(permissions(locked, comment({ isOwn: true })).canRemove).toBe(true);
  });

  it("refuses replies to a reply and to a pending comment", () => {
    expect(permissions(open, comment({ parentId: "r1" })).canReply).toBe(false);
    expect(permissions(open, comment({ status: "pending" })).canReply).toBe(false);
  });

  it("offers no reactions when the course disables them", () => {
    expect(permissions({ ...open, reactions: false }, comment()).canReact).toBe(false);
  });
});

describe("threadReducer", () => {
  it("marks the thread off when the course has discussion disabled", () => {
    const next = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: { ...open, enabled: false, state: "hidden" }, comments: [] },
    });
    expect(next.status).toBe("off");
  });

  it("marks the thread off when the activity hides it", () => {
    const next = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: { ...open, state: "hidden" }, comments: [] },
    });
    expect(next.status).toBe("off");
  });

  it("appends an inserted comment and replaces it once the server answers", () => {
    const loaded = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: open, comments: [] },
    });
    const optimistic = threadReducer(loaded, {
      kind: "inserted",
      comment: comment({ id: "temp_1", isOwn: true }),
    });
    expect(optimistic.comments.map((c) => c.id)).toEqual(["temp_1"]);

    const confirmed = threadReducer(optimistic, {
      kind: "replaced",
      id: "temp_1",
      comment: comment({ id: "cmt_9", isOwn: true }),
    });
    expect(confirmed.comments.map((c) => c.id)).toEqual(["cmt_9"]);
  });

  it("marks a removal locally rather than deleting the row", () => {
    const loaded = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: open, comments: [comment({ id: "r1", isOwn: true })] },
    });
    const next = threadReducer(loaded, { kind: "removed", id: "r1", by: author });
    expect(next.comments[0]?.status).toBe("removed");
    expect(next.comments[0]?.body).toBeNull();
    expect(next.comments[0]?.removedBy).toEqual(author);
  });

  it("toggles a reaction on and back off", () => {
    const loaded = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: open, comments: [comment({ id: "r1" })] },
    });
    const on = threadReducer(loaded, {
      kind: "reacted", id: "r1", emoji: "👍", on: true,
    });
    expect(on.comments[0]?.reactions).toEqual([{ emoji: "👍", count: 1, reacted: true }]);

    const off = threadReducer(on, { kind: "reacted", id: "r1", emoji: "👍", on: false });
    expect(off.comments[0]?.reactions).toEqual([]);
  });

  it("keeps other people's reaction count when the reader removes their own", () => {
    const seeded = comment({
      id: "r1",
      reactions: [{ emoji: "👍", count: 2, reacted: true }],
    });
    const loaded = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: open, comments: [seeded] },
    });
    const off = threadReducer(loaded, { kind: "reacted", id: "r1", emoji: "👍", on: false });
    expect(off.comments[0]?.reactions).toEqual([{ emoji: "👍", count: 1, reacted: false }]);
  });

  it("restores a snapshot on rollback", () => {
    const seeded = [comment({ id: "r1" })];
    const loaded = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: open, comments: seeded },
    });
    const optimistic = threadReducer(loaded, {
      kind: "inserted",
      comment: comment({ id: "temp_1" }),
    });
    const rolled = threadReducer(optimistic, { kind: "restored", comments: seeded });
    expect(rolled.comments.map((c) => c.id)).toEqual(["r1"]);
  });

  it("records a failure without discarding what is already on screen", () => {
    const loaded = threadReducer(initialThreadState, {
      kind: "loaded",
      view: { config: open, comments: [comment({ id: "r1" })] },
    });
    const failed = threadReducer(loaded, { kind: "failed", message: "offline" });
    expect(failed.error).toBe("offline");
    expect(failed.comments).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run apps/student/src/components/player/discussion/thread-state.test.ts`
Expected: FAIL — cannot resolve `./thread-state`.

- [ ] **Step 3: Write the module**

Create `apps/student/src/components/player/discussion/thread-state.ts`:

```ts
// Everything about the thread that is not React: grouping, permissions and the
// optimistic transitions. Kept separate so the rules are testable without a
// renderer, the way lib/video-tracking.ts is.
import type {
  CommentAuthor,
  ResolvedThreadConfig,
  ThreadComment,
  ThreadView,
} from "@headless-lms/sdk";

export type ThreadStatus = "loading" | "ready" | "error" | "off";

export interface ThreadPanelState {
  status: ThreadStatus;
  config: ResolvedThreadConfig | null;
  comments: ThreadComment[];
  /** Set by a failed mutation; the thread stays on screen. */
  error: string | null;
}

export const initialThreadState: ThreadPanelState = {
  status: "loading",
  config: null,
  comments: [],
  error: null,
};

export type ThreadAction =
  | { kind: "loading" }
  | { kind: "loaded"; view: ThreadView }
  | { kind: "failed"; message: string }
  | { kind: "inserted"; comment: ThreadComment }
  | { kind: "replaced"; id: string; comment: ThreadComment }
  | { kind: "removed"; id: string; by: CommentAuthor }
  | { kind: "reacted"; id: string; emoji: string; on: boolean }
  /** Rollback: put back the snapshot taken before an optimistic change. */
  | { kind: "restored"; comments: ThreadComment[] };

function mapOne(
  comments: ThreadComment[],
  id: string,
  fn: (c: ThreadComment) => ThreadComment,
): ThreadComment[] {
  return comments.map((c) => (c.id === id ? fn(c) : c));
}

function toggleReaction(
  comment: ThreadComment,
  emoji: string,
  on: boolean,
): ThreadComment {
  const existing = comment.reactions.find((r) => r.emoji === emoji);
  if (on) {
    const reactions = existing
      ? comment.reactions.map((r) =>
          r.emoji === emoji ? { ...r, count: r.count + 1, reacted: true } : r,
        )
      : [...comment.reactions, { emoji, count: 1, reacted: true }];
    return { ...comment, reactions };
  }
  // Only the reader's own reaction goes away — everyone else's count stands.
  const reactions = comment.reactions
    .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, reacted: false } : r))
    .filter((r) => r.count > 0);
  return { ...comment, reactions };
}

export function threadReducer(
  state: ThreadPanelState,
  action: ThreadAction,
): ThreadPanelState {
  switch (action.kind) {
    case "loading":
      return { ...state, status: "loading", error: null };
    case "loaded": {
      const { config, comments } = action.view;
      // Disabled for the course and hidden on the activity look the same to a
      // reader: the section renders nothing at all, not an empty state.
      const off = !config.enabled || config.state === "hidden";
      return { status: off ? "off" : "ready", config, comments, error: null };
    }
    case "failed":
      return {
        ...state,
        status: state.status === "loading" ? "error" : state.status,
        error: action.message,
      };
    case "inserted":
      return { ...state, comments: [...state.comments, action.comment], error: null };
    case "replaced":
      return { ...state, comments: mapOne(state.comments, action.id, () => action.comment) };
    case "removed":
      // Mark rather than delete: a root with replies must stay as a placeholder,
      // and groupThread decides whether it is still shown.
      return {
        ...state,
        comments: mapOne(state.comments, action.id, (c) => ({
          ...c,
          status: "removed",
          body: null,
          removedBy: action.by,
        })),
      };
    case "reacted":
      return {
        ...state,
        comments: mapOne(state.comments, action.id, (c) =>
          toggleReaction(c, action.emoji, action.on),
        ),
      };
    case "restored":
      return { ...state, comments: action.comments };
  }
}

export interface ThreadNode {
  comment: ThreadComment;
  replies: ThreadComment[];
}

/**
 * Roots with their replies. Mirrors the server's placeholder rule so an
 * optimistic removal behaves the same before the next fetch: a removed root
 * survives only while a visible reply hangs off it, and a removed reply is
 * never shown, because replies nest one level and hold nothing in place.
 */
export function groupThread(comments: ThreadComment[]): ThreadNode[] {
  const roots = comments.filter((c) => c.parentId === null);
  const rootIds = new Set(roots.map((r) => r.id));
  const byParent = new Map<string, ThreadComment[]>();
  for (const c of comments) {
    if (c.parentId === null || c.status === "removed" || !rootIds.has(c.parentId)) {
      continue;
    }
    byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
  }
  return roots
    .filter((c) => c.status !== "removed" || (byParent.get(c.id)?.length ?? 0) > 0)
    .map((comment) => ({ comment, replies: byParent.get(comment.id) ?? [] }));
}

export interface CommentPermissions {
  canReply: boolean;
  canReact: boolean;
  canEdit: boolean;
  canRemove: boolean;
  canReport: boolean;
}

/**
 * What this comment offers this reader. Locked is read-only for everything
 * except reporting — an archived thread can still hold something a moderator
 * needs to see — and an author may still withdraw their own comment.
 */
export function permissions(
  config: ResolvedThreadConfig,
  comment: ThreadComment,
): CommentPermissions {
  const open = config.enabled && config.state === "visible";
  const live = comment.status !== "removed";
  return {
    canReply:
      open && config.threaded && comment.parentId === null && comment.status === "published",
    canReact: open && config.reactions && live,
    canEdit: open && live && comment.isOwn,
    canRemove: live && comment.isOwn,
    canReport: config.state !== "hidden" && live && !comment.isOwn,
  };
}

/** Whether the composer is offered at all. */
export function canPost(config: ResolvedThreadConfig): boolean {
  return config.enabled && config.state === "visible";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run apps/student/src/components/player/discussion/thread-state.test.ts`
Expected: PASS, 19 passed.

- [ ] **Step 5: Typecheck, lint and commit**

Run: `pnpm --filter @headless-lms/student typecheck && pnpm lint`
Expected: both exit 0.

```bash
git add apps/student/src/components/player/discussion
git commit -m "feat(student): add the discussion thread state core"
```

---

## Task 19: Student thread — hook, components and wiring

**Files:**
- Create: `apps/student/src/components/player/discussion/use-thread.ts`
- Create: `apps/student/src/components/player/discussion/comment-composer.tsx`
- Create: `apps/student/src/components/player/discussion/comment-item.tsx`
- Create: `apps/student/src/components/player/discussion/discussion-panel.tsx`
- Modify: `apps/student/src/components/player/course-player.tsx:328` (inside the scrolling content area)

**Interfaces:**
- Consumes: `threadReducer`, `initialThreadState`, `groupThread`, `permissions`, `canPost` from Task 18; `Discussion` from `@headless-lms/sdk`; `ensureClientSdk` from `@/lib/api/client-sdk`; `useApp` from `@/lib/store`; `initials` from `@/lib/format`.
- Produces: `useThread(activityId)`, `DiscussionPanel`.

Fetching is client-side because `lessonId` changes inside `CoursePlayer` without navigation, so a server-rendered payload cannot follow it — the same reason `progress-reporter.ts` runs client-side.

- [ ] **Step 1: Write the hook**

Create `apps/student/src/components/player/discussion/use-thread.ts`:

```ts
"use client";

// Fetch and mutate one activity's thread. All state transitions go through the
// reducer in ./thread-state so the rules stay testable; this file owns only the
// network calls and the request-ordering guard.
import * as React from "react";
import { Discussion } from "@headless-lms/sdk";
import type { CommentAuthor, ThreadComment } from "@headless-lms/sdk";

import { ensureClientSdk } from "@/lib/api/client-sdk";
import { initialThreadState, threadReducer, type ThreadPanelState } from "./thread-state";

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Something went wrong";
}

export interface UseThread extends ThreadPanelState {
  post: (body: string, parentId: string | null) => Promise<void>;
  edit: (id: string, body: string) => Promise<void>;
  remove: (id: string, by: CommentAuthor) => Promise<void>;
  react: (id: string, emoji: string, on: boolean) => Promise<void>;
  report: (id: string, reason: string) => Promise<void>;
}

export function useThread(activityId: string): UseThread {
  const [state, dispatch] = React.useReducer(threadReducer, initialThreadState);
  // Guards a response for a lesson the reader has already left.
  const current = React.useRef(activityId);

  React.useEffect(() => {
    if (!activityId) return;
    current.current = activityId;
    ensureClientSdk();
    dispatch({ kind: "loading" });
    let cancelled = false;
    void Discussion.getActivityThread({ path: { activityId } })
      .then((res) => {
        if (cancelled || current.current !== activityId) return;
        if (res.data) dispatch({ kind: "loaded", view: res.data });
        else dispatch({ kind: "failed", message: "Could not load the discussion" });
      })
      .catch((err: unknown) => {
        if (cancelled || current.current !== activityId) return;
        dispatch({ kind: "failed", message: message(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  /** Apply locally, call the server, put the snapshot back if it refuses. */
  const optimistic = React.useCallback(
    async (apply: () => void, call: () => Promise<void>) => {
      const snapshot = state.comments;
      apply();
      try {
        await call();
      } catch (err: unknown) {
        dispatch({ kind: "restored", comments: snapshot });
        dispatch({ kind: "failed", message: message(err) });
      }
    },
    [state.comments],
  );

  // Not optimistic: the server decides whether a comment lands published or
  // pending, and guessing wrong would flash the wrong badge. The composer shows
  // its own busy state while this runs, so the wait is visible.
  const post = React.useCallback(
    async (body: string, parentId: string | null) => {
      ensureClientSdk();
      try {
        const res = await Discussion.postComment({
          path: { activityId },
          body: { body, parentId },
        });
        if (!res.data) throw new Error("Could not post your comment");
        dispatch({ kind: "inserted", comment: res.data });
      } catch (err: unknown) {
        dispatch({ kind: "failed", message: message(err) });
      }
    },
    [activityId],
  );

  const edit = React.useCallback(async (id: string, body: string) => {
    ensureClientSdk();
    try {
      const res = await Discussion.editComment({ path: { commentId: id }, body: { body } });
      if (!res.data) throw new Error("Could not save your change");
      dispatch({ kind: "replaced", id, comment: res.data });
    } catch (err: unknown) {
      dispatch({ kind: "failed", message: message(err) });
    }
  }, []);

  const remove = React.useCallback(
    (id: string, by: CommentAuthor) =>
      optimistic(
        () => dispatch({ kind: "removed", id, by }),
        async () => {
          ensureClientSdk();
          await Discussion.removeOwnComment({ path: { commentId: id } });
        },
      ),
    [optimistic],
  );

  const react = React.useCallback(
    (id: string, emoji: string, on: boolean) =>
      optimistic(
        () => dispatch({ kind: "reacted", id, emoji, on }),
        async () => {
          ensureClientSdk();
          if (on) {
            await Discussion.reactToComment({ path: { commentId: id }, body: { emoji } });
          } else {
            await Discussion.unreactToComment({ path: { commentId: id }, body: { emoji } });
          }
        },
      ),
    [optimistic],
  );

  // Not optimistic: the reader needs to know the signal was actually recorded.
  const report = React.useCallback(async (id: string, reason: string) => {
    ensureClientSdk();
    try {
      await Discussion.reportComment({ path: { commentId: id }, body: { reason } });
    } catch (err: unknown) {
      dispatch({ kind: "failed", message: message(err) });
      throw err;
    }
  }, []);

  return { ...state, post, edit, remove, react, report };
}

export type { ThreadComment };
```

- [ ] **Step 2: Write the composer**

Create `apps/student/src/components/player/discussion/comment-composer.tsx`:

```tsx
"use client";

import * as React from "react";

export function CommentComposer({
  placeholder,
  submitLabel,
  initialValue = "",
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  initialValue?: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [value, setValue] = React.useState(initialValue);
  const [busy, setBusy] = React.useState(false);
  const trimmed = value.trim();

  async function submit() {
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      setValue("");
      onCancel?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <textarea
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-y bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-[13px] font-medium text-ink-3 hover:text-ink"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!trimmed || busy}
          className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--brand)" }}
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the comment item**

Create `apps/student/src/components/player/discussion/comment-item.tsx`:

```tsx
"use client";

import * as React from "react";
import type { ResolvedThreadConfig, ThreadComment } from "@headless-lms/sdk";

import { initials } from "@/lib/format";
import { permissions } from "./thread-state";
import { CommentComposer } from "./comment-composer";

const EMOJI = ["👍", "🎉", "🤔"];

function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element -- avatars are remote and unsized
    return <img src={image} alt="" className="size-7 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-warm-2 text-[11px] font-semibold text-ink-3">
      {initials(name)}
    </span>
  );
}

export function CommentItem({
  comment,
  config,
  isReply = false,
  onReply,
  onEdit,
  onRemove,
  onReact,
  onReport,
}: {
  comment: ThreadComment;
  config: ResolvedThreadConfig;
  isReply?: boolean;
  onReply?: (body: string) => Promise<void>;
  onEdit: (body: string) => Promise<void>;
  onRemove: () => Promise<void>;
  onReact: (emoji: string, on: boolean) => Promise<void>;
  onReport: (reason: string) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [replying, setReplying] = React.useState(false);
  const p = permissions(config, comment);

  if (comment.status === "removed") {
    return (
      <div className={isReply ? "pl-9" : ""}>
        <p className="py-2 text-[13px] italic text-ink-3">
          {comment.removedBy
            ? `Comment removed by ${comment.removedBy.name}`
            : "Comment removed"}
        </p>
      </div>
    );
  }

  return (
    <div className={isReply ? "pl-9" : ""}>
      <div className="flex gap-2.5 py-2.5">
        <Avatar name={comment.author.name} image={comment.author.image} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold text-ink">{comment.author.name}</span>
            {comment.author.role !== "student" && (
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold capitalize"
                style={{ background: "var(--brand-soft)", color: "var(--brand-strong)" }}
              >
                {comment.author.role}
              </span>
            )}
            {comment.status === "pending" && (
              <span className="rounded bg-surface-warm-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-3">
                Awaiting review
              </span>
            )}
          </div>

          {editing ? (
            <div className="mt-2">
              <CommentComposer
                placeholder="Edit your comment"
                submitLabel="Save"
                initialValue={comment.body ?? ""}
                autoFocus
                onSubmit={onEdit}
                onCancel={() => setEditing(false)}
              />
            </div>
          ) : (
            <p className="mt-1 text-[14px] leading-relaxed whitespace-pre-wrap text-ink">
              {comment.body}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {p.canReact &&
              EMOJI.map((emoji) => {
                const summary = comment.reactions.find((r) => r.emoji === emoji);
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => void onReact(emoji, !summary?.reacted)}
                    className={`rounded-full border px-2 py-0.5 text-[12px] ${
                      summary?.reacted ? "border-brand text-ink" : "border-line text-ink-3"
                    }`}
                  >
                    {emoji}
                    {summary ? ` ${summary.count}` : ""}
                  </button>
                );
              })}
            {!p.canReact &&
              comment.reactions.map((r) => (
                <span
                  key={r.emoji}
                  className="rounded-full border border-line px-2 py-0.5 text-[12px] text-ink-3"
                >
                  {r.emoji} {r.count}
                </span>
              ))}

            {p.canReply && onReply && (
              <button
                type="button"
                onClick={() => setReplying((v) => !v)}
                className="px-1.5 text-[12px] font-medium text-ink-3 hover:text-ink"
              >
                Reply
              </button>
            )}
            {p.canEdit && (
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="px-1.5 text-[12px] font-medium text-ink-3 hover:text-ink"
              >
                Edit
              </button>
            )}
            {p.canRemove && (
              <button
                type="button"
                onClick={() => void onRemove()}
                className="px-1.5 text-[12px] font-medium text-ink-3 hover:text-ink"
              >
                Delete
              </button>
            )}
            {p.canReport && (
              <button
                type="button"
                onClick={() => void onReport("")}
                className="px-1.5 text-[12px] font-medium text-ink-3 hover:text-ink"
              >
                Report
              </button>
            )}
          </div>

          {replying && onReply && (
            <div className="mt-2">
              <CommentComposer
                placeholder="Write a reply"
                submitLabel="Reply"
                autoFocus
                onSubmit={onReply}
                onCancel={() => setReplying(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the panel**

Create `apps/student/src/components/player/discussion/discussion-panel.tsx`:

```tsx
"use client";

import * as React from "react";

import { useApp } from "@/lib/store";
import { canPost, groupThread } from "./thread-state";
import { useThread } from "./use-thread";
import { CommentComposer } from "./comment-composer";
import { CommentItem } from "./comment-item";

export function DiscussionPanel({ activityId }: { activityId: string }) {
  const thread = useThread(activityId);
  const { showToast } = useApp();

  // Surface a refused mutation once, then let the thread carry on.
  const lastError = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (thread.error && thread.error !== lastError.current) {
      lastError.current = thread.error;
      showToast(thread.error);
    }
    if (!thread.error) lastError.current = null;
  }, [thread.error, showToast]);

  // Disabled for the course, or hidden on this activity: render nothing at all.
  if (thread.status === "off" || thread.status === "loading") {
    return null;
  }

  if (thread.status === "error" || !thread.config) {
    return (
      <section className="mx-auto w-full max-w-3xl px-6 pb-10">
        <div className="border-t border-line pt-6">
          <p className="text-[13.5px] text-ink-3">
            The discussion could not be loaded.{" "}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="font-semibold underline"
            >
              Retry
            </button>
          </p>
        </div>
      </section>
    );
  }

  const config = thread.config;
  const nodes = groupThread(thread.comments);
  const count = nodes.reduce((n, node) => n + 1 + node.replies.length, 0);
  const open = canPost(config);

  return (
    <section className="mx-auto w-full max-w-3xl px-6 pb-10">
      <div className="border-t border-line pt-6">
        <h2 className="text-[15px] font-semibold text-ink">
          Discussion{count > 0 ? ` · ${count}` : ""}
        </h2>

        {open ? (
          <div className="mt-3">
            <CommentComposer
              placeholder="Ask a question or share what helped"
              submitLabel="Post"
              onSubmit={(body) => thread.post(body, null)}
            />
          </div>
        ) : (
          <p className="mt-3 text-[13.5px] text-ink-3">
            This discussion is closed. You can still read what has been posted.
          </p>
        )}

        {nodes.length === 0 && open && (
          <p className="mt-4 text-[13.5px] text-ink-3">
            No comments yet — be the first to say something.
          </p>
        )}

        <div className="mt-2 divide-y divide-line">
          {nodes.map(({ comment, replies }) => (
            <div key={comment.id} className="py-1">
              <CommentItem
                comment={comment}
                config={config}
                onReply={(body) => thread.post(body, comment.id)}
                onEdit={(body) => thread.edit(comment.id, body)}
                onRemove={() => thread.remove(comment.id, comment.author)}
                onReact={(emoji, on) => thread.react(comment.id, emoji, on)}
                onReport={(reason) =>
                  thread.report(comment.id, reason).then(() => showToast("Reported — thank you"))
                }
              />
              {replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  config={config}
                  isReply
                  onEdit={(body) => thread.edit(reply.id, body)}
                  onRemove={() => thread.remove(reply.id, reply.author)}
                  onReact={(emoji, on) => thread.react(reply.id, emoji, on)}
                  onReport={(reason) =>
                    thread.report(reply.id, reason).then(() => showToast("Reported — thank you"))
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Wire it into the player**

In `apps/student/src/components/player/course-player.tsx`, add the import beside the other player imports:

```ts
import { DiscussionPanel } from "./discussion/discussion-panel";
```

and render it directly after `ContentArea`, still inside the scrolling `div` so it shares one scroll context with the lesson (line 328):

```tsx
            <editorMedia.MediaProvider
              onEvent={onMediaEvent}
              startPosition={startPosition}
              refreshUrl={refreshUrl}
            >
              <ContentArea node={curLesson ? renderedContent[curLessonId] : null} />
            </editorMedia.MediaProvider>
            {curLessonId && <DiscussionPanel key={curLessonId} activityId={curLessonId} />}
```

The `key` matters: it discards composer drafts and in-flight edit state when the reader moves to another lesson, rather than carrying them across.

- [ ] **Step 6: Verify**

Run: `pnpm --filter @headless-lms/student typecheck && pnpm lint`
Expected: both exit 0.

Run: `pnpm vitest run apps/student`
Expected: PASS — the Task 18 suite and the existing `video-tracking` suite.

Run: `pnpm --filter @headless-lms/student build`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/student/src
git commit -m "feat(student): render the comment thread under each lesson"
```

---

## Task 20: Admin — the course Discussion tab

**Files:**
- Create: `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/page.tsx`
- Create: `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/actions.ts`
- Create: `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/_components/settings-form.tsx`
- Create: `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/_components/queue-list.tsx`
- Modify: `apps/admin/src/app/(dashboard)/courses/[courseId]/_components/course-tabs-nav.tsx:13-18`

**Interfaces:**
- Consumes: `Discussion` from `@headless-lms/sdk`; `ensureConfigured`, `authHeaders`, `unwrap` from `@/lib/api/server-call`.
- Produces: `setDiscussionSettingsAction`, `approveCommentAction`, `moderateRemoveCommentAction`, `restoreCommentAction`, `resolveCommentReportsAction` — all consumed by the two client components in this task.

Server components read; every mutation is a server action that calls the SDK with `authHeaders()` and then revalidates, exactly as `courses/[courseId]/actions.ts` already does.

- [ ] **Step 1: Read the pattern first**

```bash
sed -n '1,40p' apps/admin/src/app/\(dashboard\)/courses/\[courseId\]/actions.ts
sed -n '1,40p' apps/admin/src/app/\(dashboard\)/courses/\[courseId\]/access/page.tsx
```

Copy the import style, the `ensureConfigured()` / `unwrap()` / `authHeaders()` shape and the page's params handling. If `access/page.tsx` does not exist, read `details/page.tsx` instead.

Then confirm what `@hey-api/openapi-ts` actually named the response types — it derives them from the schema, and `QueueEntry` / `DiscussionSettings` may surface as operation-response aliases instead:

```bash
grep -n "QueueEntry\|ModerationQueue\|DiscussionSettings\|ThreadState" packages/sdk/src/generated/types.gen.ts | head -20
```

Use whatever names are there. If only operation aliases exist, follow `apps/admin/src/lib/api/types.ts`, which already re-exports SDK response types under local names (`export type Member = ListMembersResponse["rows"][number]`), and add the discussion ones there.

- [ ] **Step 2: Add the tab**

In `course-tabs-nav.tsx`, add `MessagesSquare` to the `lucide-react` import and a fifth entry after `access`:

```ts
  { segment: "discussion", label: "Discussion", icon: MessagesSquare },
```

- [ ] **Step 3: Write the server actions**

Create `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/actions.ts`:

```ts
"use server";

// Server actions for the course's discussion settings and moderation queue.

import { revalidatePath } from "next/cache";
import { Discussion } from "@headless-lms/sdk";
import type { DiscussionSettings, SetDiscussionSettings } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap } from "@/lib/api/server-call";

function revalidateDiscussion(): void {
  revalidatePath("/courses/[courseId]/discussion", "page");
}

export async function setDiscussionSettingsAction(
  courseId: string,
  patch: SetDiscussionSettings,
): Promise<DiscussionSettings> {
  ensureConfigured();
  const settings = unwrap(
    await Discussion.setDiscussionSettings({
      path: { courseId },
      body: patch,
      ...(await authHeaders()),
    }),
  );
  revalidateDiscussion();
  return settings;
}

export async function approveCommentAction(commentId: string): Promise<void> {
  ensureConfigured();
  unwrap(await Discussion.approveComment({ path: { commentId }, ...(await authHeaders()) }));
  revalidateDiscussion();
}

export async function moderateRemoveCommentAction(commentId: string): Promise<void> {
  ensureConfigured();
  const headers = await authHeaders();
  unwrap(await Discussion.moderateRemoveComment({ path: { commentId }, ...headers }));
  // Removing a reported comment settles its reports too, so a handled comment
  // leaves both tabs rather than lingering in the reported one.
  await Discussion.resolveCommentReports({ path: { commentId }, ...headers });
  revalidateDiscussion();
}

export async function restoreCommentAction(commentId: string): Promise<void> {
  ensureConfigured();
  unwrap(await Discussion.restoreComment({ path: { commentId }, ...(await authHeaders()) }));
  revalidateDiscussion();
}

export async function resolveCommentReportsAction(commentId: string): Promise<void> {
  ensureConfigured();
  await Discussion.resolveCommentReports({ path: { commentId }, ...(await authHeaders()) });
  revalidateDiscussion();
}
```

- [ ] **Step 4: Write the settings form**

Create `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/_components/settings-form.tsx`:

```tsx
"use client";

import * as React from "react";
import { toast } from "sonner";
import type { DiscussionSettings } from "@headless-lms/sdk";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setDiscussionSettingsAction } from "../actions";

const FIELDS = [
  { key: "enabled", label: "Enabled", hint: "Show a comment thread on this course's lessons." },
  { key: "threaded", label: "Replies", hint: "Let learners reply to a comment." },
  { key: "requireReview", label: "Review before publishing", hint: "Hold learner comments until a moderator approves them." },
  { key: "reactions", label: "Reactions", hint: "Let learners react to a comment." },
] as const;

export function SettingsForm({ settings }: { settings: DiscussionSettings }) {
  const [value, setValue] = React.useState(settings);
  const [isPending, startTransition] = React.useTransition();

  function update(key: (typeof FIELDS)[number]["key"], next: boolean) {
    const previous = value;
    setValue({ ...value, [key]: next });
    startTransition(async () => {
      try {
        await setDiscussionSettingsAction(settings.courseId, { [key]: next });
      } catch (err) {
        setValue(previous);
        toast.error("Could not save", { description: (err as Error).message });
      }
    });
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">Settings</h2>
      <div className="mt-4 space-y-4">
        {FIELDS.map(({ key, label, hint }) => (
          <div key={key} className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <Label htmlFor={`discussion-${key}`}>{label}</Label>
              <p className="mt-0.5 text-xs text-ink-3">{hint}</p>
            </div>
            <Switch
              id={`discussion-${key}`}
              checked={value[key]}
              // The other three have no effect while discussion is off.
              disabled={isPending || (key !== "enabled" && !value.enabled)}
              onCheckedChange={(next) => update(key, next)}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Write the queue**

Create `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/_components/queue-list.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import type { QueueEntry } from "@headless-lms/sdk";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import {
  approveCommentAction,
  moderateRemoveCommentAction,
  resolveCommentReportsAction,
} from "../actions";

export type QueueKind = "pending" | "reported";

export function QueueList({ kind, entries }: { kind: QueueKind; entries: QueueEntry[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  function select(next: QueueKind) {
    const search = new URLSearchParams(params.toString());
    search.set("kind", next);
    router.push(`${pathname}?${search.toString()}`);
  }

  function run(label: string, action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action();
        toast.success(label);
      } catch (err) {
        toast.error("Could not complete", { description: (err as Error).message });
      }
    });
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Queue</h2>
        <div className="inline-flex rounded-md border border-line p-0.5">
          {(["pending", "reported"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => select(k)}
              className={`rounded px-3 py-1 text-xs font-medium capitalize ${
                kind === k ? "bg-surface-warm-2 text-ink" : "text-ink-3 hover:text-ink"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">
          {kind === "pending"
            ? "Nothing is waiting for review."
            : "No comments have been reported."}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {entries.map((entry) => (
            <Card key={entry.comment.id} className="p-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-ink-3">
                <span className="text-sm font-semibold text-ink">{entry.author.name}</span>
                <span>{entry.authorEmail}</span>
                <span>·</span>
                <span>{entry.activityTitle}</span>
                <span>·</span>
                <span>{formatRelative(entry.comment.createdAt)}</span>
              </div>

              <p className="mt-2 text-sm whitespace-pre-wrap text-ink">{entry.comment.body}</p>

              {entry.reports.length > 0 && (
                <ul className="mt-3 space-y-1 border-l-2 border-line pl-3">
                  {entry.reports.map((report, i) => (
                    <li key={i} className="text-xs text-ink-3">
                      <span className="font-medium text-ink">{report.reporter.name}</span>
                      {report.reason ? ` — ${report.reason}` : " flagged this"}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {kind === "pending" && (
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run("Approved", () => approveCommentAction(entry.comment.id))
                    }
                  >
                    Approve
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() =>
                    run("Removed", () => moderateRemoveCommentAction(entry.comment.id))
                  }
                >
                  Remove
                </Button>
                {kind === "reported" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() =>
                      run("Reports dismissed", () =>
                        resolveCommentReportsAction(entry.comment.id),
                      )
                    }
                  >
                    Dismiss reports
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
```

Confirm `formatRelative` exists in `apps/admin/src/lib/format.ts`:

```bash
grep -n "export function" apps/admin/src/lib/format.ts
```
If it is named differently, use the real helper; if there is none, render `new Date(...).toLocaleDateString()` inline rather than adding a formatter.

- [ ] **Step 6: Write the page**

Create `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/page.tsx`:

```tsx
// Discussion settings and the moderation queue for one course. Both queues are
// already course-scoped by the API, so this tab is the whole moderation surface.
import { Discussion } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap } from "@/lib/api/server-call";
import { SettingsForm } from "./_components/settings-form";
import { QueueList, type QueueKind } from "./_components/queue-list";

export default async function CourseDiscussionPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { courseId } = await params;
  const { kind: rawKind } = await searchParams;
  const kind: QueueKind = rawKind === "reported" ? "reported" : "pending";

  ensureConfigured();
  const headers = await authHeaders();
  const [settings, queue] = await Promise.all([
    Discussion.getDiscussionSettings({ path: { courseId }, ...headers }).then(unwrap),
    Discussion.getModerationQueue({ query: { kind, courseId }, ...headers }).then(unwrap),
  ]);

  return (
    <div className="space-y-8 py-6">
      <SettingsForm settings={settings} />
      <QueueList kind={kind} entries={queue.entries} />
    </div>
  );
}
```

Match the surrounding pages' `params` handling: if the other course tabs take `params` synchronously rather than as a promise, follow them instead.

- [ ] **Step 7: Verify**

Run: `pnpm --filter @headless-lms/admin typecheck && pnpm lint`
Expected: both exit 0.

Run: `pnpm --filter @headless-lms/admin build`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/admin/src
git commit -m "feat(admin): add the course discussion settings and moderation queue"
```

---

## Task 21: Admin — per-activity thread state

**Files:**
- Modify: `apps/admin/src/app/(dashboard)/courses/[courseId]/_components/item-form-sheet.tsx`
- Modify: `apps/admin/src/app/(dashboard)/courses/[courseId]/content/page.tsx`
- Modify: `apps/admin/src/app/(dashboard)/courses/[courseId]/_components/module-list.tsx`
- Modify: `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/actions.ts`

**Interfaces:**
- Consumes: `Discussion.getThreadStates` and `Discussion.setActivityThreadState` from the SDK.
- Produces: `setActivityThreadStateAction(activityId, state)`.

Thread state is a discussion-context row, not part of the activity's opaque `settings` blob, so it cannot ride along in `saveActivityAction`'s payload — the sheet makes a second call, and only when the value changed.

- [ ] **Step 1: Add the action**

Append to `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/actions.ts`:

```ts
import type { ThreadState } from "@headless-lms/sdk";

/** null clears the override so the course setting applies again. */
export async function setActivityThreadStateAction(
  activityId: string,
  state: ThreadState | null,
): Promise<void> {
  ensureConfigured();
  await Discussion.setActivityThreadState({
    path: { activityId },
    body: { state },
    ...(await authHeaders()),
  });
  revalidatePath("/courses/[courseId]/content", "page");
}
```

- [ ] **Step 2: Fetch the overrides on the Content page**

In `apps/admin/src/app/(dashboard)/courses/[courseId]/content/page.tsx`, fetch the map alongside whatever the page already loads and pass it down to `ModuleList`:

```tsx
  const threadStates = await Discussion.getThreadStates({
    path: { courseId },
    ...(await authHeaders()),
  })
    .then(unwrap)
    .then((r) => r.states)
    // Discussion is optional; a failure here must not take down the content tab.
    .catch(() => ({} as Record<string, ThreadState>));
```

Add `threadStates` to the props `ModuleList` already receives, and have `ModuleList` pass `threadState={threadStates[item.id] ?? null}` into `ItemFormSheet` for the activity it opens.

- [ ] **Step 3: Add the control to the sheet**

In `item-form-sheet.tsx`, extend the props and the form:

```tsx
import type { ThreadState } from "@headless-lms/sdk";
import { setActivityThreadStateAction } from "../discussion/actions";

const THREAD_OPTIONS: { value: ThreadState | null; label: string }[] = [
  { value: null, label: "Course default" },
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Hidden" },
  { value: "locked", label: "Locked" },
];
```

Add `threadState` to the component's props:

```tsx
  threadState?: ThreadState | null;
```

Hold it in local state beside the form, seeded whenever the sheet opens:

```tsx
  const [thread, setThread] = React.useState<ThreadState | null>(threadState ?? null);
  React.useEffect(() => {
    if (open) setThread(threadState ?? null);
  }, [open, threadState]);
```

Render it after the existing fields, inside the form:

```tsx
      <div className="space-y-1.5">
        <Label>Discussion</Label>
        <div className="inline-flex flex-wrap gap-1 rounded-md border border-line p-0.5">
          {THREAD_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setThread(option.value)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                thread === option.value
                  ? "bg-surface-warm-2 text-ink"
                  : "text-ink-3 hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-3">
          Inherits the course setting unless overridden here.
        </p>
      </div>
```

Then in `onValid`, after `saveActivityAction` resolves, write the override only when it changed:

```tsx
    startTransition(async () => {
      try {
        const saved = await saveActivityAction(courseId, moduleId, payload);
        if (thread !== (threadState ?? null)) {
          const activityId = isEdit ? item!.id : saved.at(-1)?.activities?.at(-1)?.id;
          if (activityId) {
            await setActivityThreadStateAction(activityId, thread);
          }
        }
        toast.success("Saved");
        onOpenChange(false);
      } catch (err) {
        toast.error("Something went wrong", { description: (err as Error).message });
      }
    });
```

Read what `saveActivityAction` actually returns before writing that `activityId` line — if it returns the saved activity directly, use its `id`; if it returns the module list, walk to the new activity. For a brand-new activity with `thread === null` there is nothing to write, so the common case makes no second call.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @headless-lms/admin typecheck && pnpm lint`
Expected: both exit 0.

Run: `pnpm --filter @headless-lms/admin build`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src
git commit -m "feat(admin): set a per-activity thread state from the activity sheet"
```

---

## Task 22: End-to-end verification

**Files:** none — this task changes nothing and gates the branch.

- [ ] **Step 1: Full build and suite**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
Expected: all four exit 0.

- [ ] **Step 2: Confirm the SDK is not stale**

```bash
pnpm gen:sdk && git status --porcelain packages/sdk
```
Expected: no output from `git status` — the committed spec already matches the routes. A diff here means Task 16 ran before a later route change; commit the regenerated files.

- [ ] **Step 3: Drive it once in the real apps**

Run: `pnpm dev`

Then, as a staff user in the admin app (`:8001`):
1. Open a course → Discussion. Confirm every switch is off and the queue is empty — an unconfigured course starts disabled.
2. Turn on Enabled, Replies and Reactions. Leave review off.
3. Open Content → edit a lesson → confirm the Discussion control shows "Course default". Leave it.

As an enrolled learner in the student app (`:8002`):
4. Open that lesson. The thread appears under the content with a composer.
5. Post a comment, reply to it, react, then edit and delete the reply. Confirm the reply's placeholder does **not** appear — a removed reply is never served.
6. Open a lesson in a course where discussion is off. Confirm nothing renders — no heading, no empty state.

Back in admin:
7. Turn on "Review before publishing". As the learner, post again; confirm it shows "Awaiting review" to its author and does not appear for a second learner.
8. In the Discussion tab's Pending queue, confirm the entry names the author, their email and the lesson title. Approve it and confirm it appears for the second learner.
9. As the second learner, report a comment. Confirm the Reported queue shows the reporter and reason, and that Remove clears it from both tabs.
10. Set the lesson's thread state to Locked in the activity sheet. As a learner, confirm the composer is replaced by the closed notice, reactions disappear, and **Report is still offered**.

- [ ] **Step 4: Commit anything the walkthrough corrected**

```bash
git add -A
git commit -m "fix(discussion): corrections from the end-to-end walkthrough"
```

If nothing needed fixing, skip the commit.

---

## Self-Review Notes

Checked against `docs/domain/discussion.md` (as amended by `00b0a90`) and `docs/superpowers/specs/2026-07-27-discussion-ui-design.md`.

| Spec rule | Task |
|---|---|
| Thread attaches to an activity | 4 (schema), 7 (post) |
| **A comment records no course; it is resolved at read time** | 3, 4, 6 (`courseOf`), 11 (queue), 12 (`courseOfActivity`) |
| Three moderation states + who removed | 3, 4, 9 |
| **Removed → placeholder only when the reader sees a reply** | 8 (service), 18 (`groupThread` mirrors it) |
| Settings per course; thread state per activity; one-step resolution | 6 |
| visible / hidden / locked semantics | 6, 7, 10 |
| **Locked accepts reports; refuses everything else** | 11 (service), 18 (`permissions`), 19 (UI) |
| Thread state never changes moderation state | 6 (separate paths), 9 |
| Review: pending, learners only, author sees own, no replies to pending | 7, 8 |
| Review evaluated at posting time only | 7 |
| Approval attaches to the comment | 7 (no trust state exists) |
| Reports never change state; one per person per comment; one event | 11 |
| Author full control; edit not evented | 9 |
| **Staff-ness read fresh, never stored** | 8 (`authorsOf`), 15 (`Actor` from `scope.role`) |
| Moderation is any staff participation | 9, 11 (`actor.isStaff`) |
| Queue scoped by course | 11, 12 (activity → module join) |
| Removing an activity removes its discussion | 4 (cascade FKs) |
| Four events, `comment.removed` names the remover | 3, 7, 9, 11 |
| Reactions/edits/thread-state not evented | 10 (asserted), 9, 6 |
| Entitlements gate | 15 (at the edge, as `learn.ts` does) |
| **Replies nest one level** | 7 (rejected), 8 (flat grouping), 18 (`groupThread`) |
| **Unconfigured course is disabled** | 6 (`DEFAULT_SETTINGS`) |
| Author is a resolved profile, not an id or a boolean | 3, 8, 12 (`authorsOf`) |
| Learners never see each other's emails | 3 (`Omit`), 11 (`authorEmail` queue-only), 14 |
| Queue carries author, activity title and the reports | 5 (`QueueEntry`), 11, 12 |
| Staff can read per-activity overrides | 5, 15 (`getThreadStates`), 21 |
| Person shape declared once | 1, 2, 17 |
| Student thread inline under the lesson | 19 |
| Admin moderation on a course tab | 20 |
| Thread state in the activity sheet | 21 |

**Two things worth watching during execution:**

1. **Task 2 is a wide refactor before any discussion code exists.** It touches nine files across the contract, two contexts, the reporting layer and the auth adapter. If `pnpm test` goes red there, the cause is almost always `image` optionality (Step 5), not a behaviour change. Resist widening the type back — the whole point is that it is now always present.

2. **`joinOrgUserProfile`'s generic signature is the one piece of Task 2 that may not survive contact with Drizzle's builder types.** Both Task 2 Step 2 and Task 12 Step 3 say what to do if it does not: write the two `leftJoin` lines inline and keep `orgUserProfileColumns`, which is where most of the duplication actually lived.

