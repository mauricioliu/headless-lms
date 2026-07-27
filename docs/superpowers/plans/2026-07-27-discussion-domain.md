# Discussion Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `discussion` bounded context — comments on an activity, replies, reactions, reports, moderation and review — end to end from domain types to HTTP routes and generated SDK.

**Architecture:** A ninth core context at `packages/server/src/core/discussion/`, following the same file contract as every other context (`service.ts`, `model.ts`, `types.ts`, `events.ts`, `ports.ts`, `index.ts`, `service.test.ts`). Domain entities live in `@headless-lms/types`; Drizzle tables in `adapters/db/schema/discussion.ts`; the repository in `adapters/db/repositories/discussion.ts`. Writes that emit events run through a `UnitOfWork` so the row and the outbox entry commit together, exactly as `progress` does. The entitlements access gate is enforced at the HTTP edge (as `learn.ts` already does for progress), never inside core.

**Tech Stack:** TypeScript (strict, ESM), Fastify 5, Drizzle ORM, Postgres 17, Zod 4, vitest, `fastify-type-provider-zod`, `@hey-api/openapi-ts`.

## Global Constraints

- Spec: `docs/domain/discussion.md`. Read it before Task 1. Every rule below is from it.
- Branch: `feat/discussion-domain`, worktree `.claude/worktrees/discussion`. All commands run from the worktree root.
- Node 22, ESM. **Every relative import ends in `.js`**, including from `.ts` files.
- `core/` may not import `adapters/`, `http/`, `app/`, `reporting/`, `fastify`, `pg`, or `drizzle-orm`.
- A context imports another context only through its `index.ts`. `core/shared/*` is the exception.
- Domain entities, DTOs and events are declared **once** in `packages/types/src/discussion.ts`. `model.ts` / `types.ts` / `events.ts` re-export — never re-declare.
- The actor on every table is `org_users.id` (composite `(org_id, org_user_id)`). There is no `students` table. Staff-ness is `role !== 'student'`, read fresh; **never stored on a comment**.
- Org-scoped tables use a composite `(org_id, id)` primary key with `org_id` → `organizations.id`.
- Run `pnpm lint` and `pnpm typecheck` before every commit. Both must pass.
- **Assumption to confirm before Task 4:** a course with no settings row defaults to `{ enabled: false, threaded: true, requireReview: false, reactions: true }` — discussion is opt-in, so the common case stores no row. The spec does not state a default. If the product wants discussion on by default, change `DEFAULT_SETTINGS` in Task 4 and nothing else.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/types/src/discussion.ts` | Entities, DTOs, events. Zero deps. |
| `packages/types/src/index.ts` | Add the barrel export. |
| `packages/server/src/core/shared/id.ts` | Add `comment` / `commentReport` id prefixes. |
| `packages/server/src/adapters/db/schema/discussion.ts` | Five tables. |
| `packages/server/src/adapters/db/schema/index.ts` | Add the barrel export. |
| `packages/server/src/core/discussion/{model,types,events,ports,index}.ts` | Context contract. |
| `packages/server/src/core/discussion/service.ts` | All domain rules. |
| `packages/server/src/core/discussion/service.test.ts` | Unit tests against fakes. |
| `packages/server/src/adapters/db/repositories/discussion.ts` | Drizzle implementation of the outbound port. |
| `packages/server/src/app/container.ts` | Wire repo + UoW + service. |
| `.eslintrc.cjs` | Add `discussion` to the context list. |
| `packages/api-contract/src/discussion.ts` | Zod request/response schemas. |
| `packages/server/src/http/routes/discussion.ts` | Learner + moderator routes. |
| `packages/server/src/http/routes.ts` | Register. |

---

## Task 1: Domain types and id prefixes

**Files:**
- Create: `packages/types/src/discussion.ts`
- Modify: `packages/types/src/index.ts`
- Modify: `packages/server/src/core/shared/id.ts:11-28` (the `ID_PREFIXES` map)

**Interfaces:**
- Consumes: `DomainEvent` from `packages/types/src/shared.js`.
- Produces: `Comment`, `CommentReaction`, `CommentReport`, `DiscussionSettings`, `ActivityThreadState`, `CommentStatus`, `ThreadState`, `PostCommentInput`, `DiscussionEvent` and its four members. `genId('comment')`, `genId('commentReport')`.

- [ ] **Step 1: Write the type module**

Create `packages/types/src/discussion.ts`:

```ts
// discussion context — domain entities, DTOs, and events.
//
// A Comment attaches to an activity and optionally replies to another comment.
// The author is an org_users participation; whether they are staff is read from
// their current role at render time and never stored here. A removed comment is
// retained so its replies survive — only its body stops being served.

import type { DomainEvent } from "./shared.js";

export type CommentStatus = "pending" | "published" | "removed";

/** Per-activity override of the course's discussion settings. */
export type ThreadState = "visible" | "hidden" | "locked";

export interface Comment {
  readonly id: string;
  readonly orgId: string;
  readonly activityId: string;
  /** The course the activity sits within — lets the moderation queue scope to a
   *  course without reading content structure. */
  readonly courseId: string;
  /** null = a root comment. */
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
  orgUserId: string;
  /** null = a root comment. */
  parentId: string | null;
  body: string;
}

/** One comment as served to a reader: the row plus what the reader is allowed
 *  to see. `body` is null when the comment is removed. */
export interface ThreadComment {
  id: string;
  parentId: string | null;
  orgUserId: string;
  /** null when removed — the placeholder carries `removedBy` instead. */
  body: string | null;
  status: CommentStatus;
  removedBy: string | null;
  /** Resolved from the author's current role, never stored. */
  authorIsStaff: boolean;
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

## Task 2: Drizzle schema and migration

**Files:**
- Create: `packages/server/src/adapters/db/schema/discussion.ts`
- Modify: `packages/server/src/adapters/db/schema/index.ts`

**Interfaces:**
- Consumes: `organizations` from `./organizations.js`, `activities` and `courses` from `./content.js`, `orgUsers` from `./organizations.js`.
- Produces: `comments`, `commentReactions`, `commentReports`, `discussionSettings`, `activityThreadStates` Drizzle tables.

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
    // Denormalized so the moderation queue can scope to a course without
    // walking content structure (discussion may not read it).
    courseId: text('course_id').notNull(),
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
    courseFk: foreignKey({
      columns: [t.orgId, t.courseId],
      foreignColumns: [courses.orgId, courses.id],
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
    queueIdx: index('comments_queue_idx').on(t.orgId, t.courseId, t.status, t.createdAt),
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

Run: `pnpm db:migrate`
Expected: exits 0.

Then verify the self-referencing parent FK does not cascade:

```bash
psql "$DATABASE_URL" -c "\d comments" | grep -i "parent_id\|removed_by"
```
Expected: the `parent_id` foreign key line has no `ON DELETE CASCADE`.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @headless-lms/server typecheck`
Expected: exits 0.

```bash
git add packages/server/src/adapters/db/schema/discussion.ts packages/server/src/adapters/db/schema/index.ts packages/server/drizzle
git commit -m "feat(discussion): add comments, reactions, reports and settings tables"
```

---

## Task 3: Context skeleton — model, types, events, ports, index

**Files:**
- Create: `packages/server/src/core/discussion/model.ts`
- Create: `packages/server/src/core/discussion/types.ts`
- Create: `packages/server/src/core/discussion/events.ts`
- Create: `packages/server/src/core/discussion/ports.ts`
- Create: `packages/server/src/core/discussion/index.ts`
- Modify: `.eslintrc.cjs:19-26` (the context list)

**Interfaces:**
- Consumes: the types from Task 1; `OutboxAppender`, `UnitOfWork`, `Logger` from `../shared/ports.js`.
- Produces: `DiscussionService`, `DiscussionRepository`, `DiscussionUnitOfWork`, `DiscussionWriteScope`, `NewDiscussionEvent`.

- [ ] **Step 1: Write model.ts, types.ts, events.ts**

`packages/server/src/core/discussion/model.ts`:

```ts
// discussion context — domain entities, owned by @headless-lms/types.
export type {
  Comment,
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

/** One entry in a moderator's work queue. */
export interface QueueEntry {
  comment: Comment;
  openReports: number;
}

export interface QueueQuery {
  /** Scope to one course; omitted = the whole org. */
  courseId?: string;
  /** "pending" = awaiting review; "reported" = carrying unresolved reports. */
  kind: 'pending' | 'reported';
}

/** The caller's identity and standing, resolved at the HTTP edge. Core never
 *  looks a role up itself. */
export interface Actor {
  orgUserId: string;
  isStaff: boolean;
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
  /** Course settings with the activity's override applied. */
  resolveConfig(orgId: string, activityId: string, courseId: string): Promise<ResolvedThreadConfig>;

  /** Post a root comment or a reply. Lands pending where review is required and
   *  the actor is not staff. */
  post(orgId: string, courseId: string, actor: Actor, input: PostCommentInput): Promise<Comment>;
  /** Author-only. Throws ForbiddenError for anyone else. */
  edit(orgId: string, commentId: string, actor: Actor, body: string): Promise<Comment>;
  /** Author or any staff member. */
  remove(orgId: string, commentId: string, actor: Actor): Promise<Comment>;
  /** Staff only. Returns the comment to published. */
  restore(orgId: string, commentId: string, actor: Actor): Promise<Comment>;
  /** Staff only. Publishes a pending comment. */
  approve(orgId: string, commentId: string, actor: Actor): Promise<Comment>;

  /** The thread as this reader may see it. */
  listThread(orgId: string, activityId: string, courseId: string, actor: Actor): Promise<ThreadView>;

  react(orgId: string, commentId: string, actor: Actor, emoji: string): Promise<void>;
  unreact(orgId: string, commentId: string, actor: Actor, emoji: string): Promise<void>;

  report(orgId: string, commentId: string, actor: Actor, reason: string): Promise<CommentReport>;
  resolveReport(orgId: string, reportId: string, actor: Actor): Promise<CommentReport>;

  /** Staff only. */
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
  /** True when any comment names this one as its parent. */
  hasReplies(orgId: string, commentId: string): Promise<boolean>;
  /** Comment ids that have at least one reply — one round trip for a thread. */
  idsWithReplies(orgId: string, commentIds: string[]): Promise<string[]>;

  listReactions(orgId: string, commentIds: string[]): Promise<CommentReaction[]>;
  insertReaction(orgId: string, reaction: CommentReaction): Promise<void>;
  deleteReaction(
    orgId: string,
    commentId: string,
    orgUserId: string,
    emoji: string,
  ): Promise<void>;

  insertReport(orgId: string, report: CommentReport): Promise<CommentReport | null>;
  findReport(orgId: string, id: string): Promise<CommentReport | null>;
  resolveReport(orgId: string, id: string, resolvedAt: string): Promise<CommentReport | null>;
  /** Unresolved report counts keyed by comment id. */
  openReportCounts(orgId: string, commentIds: string[]): Promise<Record<string, number>>;

  findSettings(orgId: string, courseId: string): Promise<DiscussionSettings | null>;
  upsertSettings(orgId: string, settings: DiscussionSettings): Promise<DiscussionSettings>;
  findThreadState(orgId: string, activityId: string): Promise<ThreadState | null>;
  upsertThreadState(orgId: string, activityId: string, state: ThreadState): Promise<void>;
  clearThreadState(orgId: string, activityId: string): Promise<void>;

  /** Comments in `status`, scoped to a course when given. */
  listByStatus(orgId: string, status: Comment['status'], courseId?: string): Promise<Comment[]>;
  /** Comments carrying at least one unresolved report. */
  listReported(orgId: string, courseId?: string): Promise<Comment[]>;

  /** Roles of the given participations, keyed by org_users.id — used only to
   *  resolve the instructor badge at read time. */
  rolesOf(orgId: string, orgUserIds: string[]): Promise<Record<string, string>>;
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
} from './ports.js';
export type {
  Comment,
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
Expected: fails with "Cannot find module './service.js'" — `index.ts` references a service that does not exist yet. This is expected; Task 4 creates it.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/core/discussion .eslintrc.cjs packages/server/src/core/shared/errors.ts packages/server/src/http
git commit -m "feat(discussion): add context ports, model and event contract"
```

---

## Task 4: Settings resolution

**Files:**
- Create: `packages/server/src/core/discussion/service.ts`
- Create: `packages/server/src/core/discussion/service.test.ts`

**Interfaces:**
- Consumes: `DiscussionRepository`, `DiscussionUnitOfWork` from `./ports.js`.
- Produces: `DiscussionServiceImpl` class, `DEFAULT_SETTINGS` const. Later tasks add methods to the same class.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/core/discussion/service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DiscussionServiceImpl, DEFAULT_SETTINGS } from './service.js';
import type { DiscussionRepository, DiscussionUnitOfWork } from './ports.js';
import type {
  Comment,
  CommentReaction,
  CommentReport,
  DiscussionSettings,
  ThreadState,
} from './model.js';
import type { NewDiscussionEvent } from './events.js';

export function fakeRepo() {
  const comments: Comment[] = [];
  const reactions: CommentReaction[] = [];
  const reports: CommentReport[] = [];
  const settings = new Map<string, DiscussionSettings>();
  const threadStates = new Map<string, ThreadState>();
  const roles = new Map<string, string>();

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
    async hasReplies(orgId, commentId) {
      return comments.some((c) => c.orgId === orgId && c.parentId === commentId);
    },
    async idsWithReplies(orgId, commentIds) {
      return commentIds.filter((id) =>
        comments.some((c) => c.orgId === orgId && c.parentId === id),
      );
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
    async findReport(orgId, id) {
      return reports.find((r) => r.orgId === orgId && r.id === id) ?? null;
    },
    async resolveReport(orgId, id, resolvedAt) {
      const r = reports.find((x) => x.orgId === orgId && x.id === id);
      if (!r) return null;
      r.resolvedAt = resolvedAt;
      return { ...r };
    },
    async openReportCounts(orgId, commentIds) {
      const out: Record<string, number> = {};
      for (const r of reports) {
        if (r.orgId === orgId && !r.resolvedAt && commentIds.includes(r.commentId)) {
          out[r.commentId] = (out[r.commentId] ?? 0) + 1;
        }
      }
      return out;
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
    async upsertThreadState(orgId, activityId, state) {
      threadStates.set(`${orgId}:${activityId}`, state);
    },
    async clearThreadState(orgId, activityId) {
      threadStates.delete(`${orgId}:${activityId}`);
    },
    async listByStatus(orgId, status, courseId) {
      return comments.filter(
        (c) =>
          c.orgId === orgId &&
          c.status === status &&
          (courseId === undefined || c.courseId === courseId),
      );
    },
    async listReported(orgId, courseId) {
      const open = new Set(reports.filter((r) => !r.resolvedAt).map((r) => r.commentId));
      return comments.filter(
        (c) =>
          c.orgId === orgId &&
          open.has(c.id) &&
          (courseId === undefined || c.courseId === courseId),
      );
    },
    async rolesOf(_orgId, orgUserIds) {
      const out: Record<string, string> = {};
      for (const id of orgUserIds) out[id] = roles.get(id) ?? 'student';
      return out;
    },
  };
  return { repo, comments, reactions, reports, settings, threadStates, roles };
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

  it('resolves to visible when the activity has no override', async () => {
    const { service } = makeService();
    await service.setSettings('o1', 'c1', { enabled: true });
    const config = await service.resolveConfig('o1', 'a1', 'c1');
    expect(config).toEqual({
      enabled: true,
      threaded: true,
      requireReview: false,
      reactions: true,
      state: 'visible',
    });
  });

  it("lets an activity's thread state override the course", async () => {
    const { service } = makeService();
    await service.setSettings('o1', 'c1', { enabled: true });
    await service.setThreadState('o1', 'a1', 'locked');
    expect((await service.resolveConfig('o1', 'a1', 'c1')).state).toBe('locked');
  });

  it('falls back to the course setting once the override is cleared', async () => {
    const { service } = makeService();
    await service.setSettings('o1', 'c1', { enabled: true });
    await service.setThreadState('o1', 'a1', 'hidden');
    await service.setThreadState('o1', 'a1', null);
    expect((await service.resolveConfig('o1', 'a1', 'c1')).state).toBe('visible');
  });

  it('resolves state to hidden when discussion is disabled for the course', async () => {
    const { service } = makeService();
    const config = await service.resolveConfig('o1', 'a1', 'c1');
    expect(config.enabled).toBe(false);
    expect(config.state).toBe('hidden');
  });
});
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
// HTTP edge — core never looks a role up to make a decision. Roles ARE read
// back for the instructor badge, which is presentation, not authorisation.
import { genId } from '../shared/id.js';
import { ForbiddenError, NotFoundError } from '../shared/errors.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { Comment, DiscussionSettings, ThreadState } from './model.js';
import type { ResolvedThreadConfig } from './types.js';
import type {
  Actor,
  DiscussionRepository,
  DiscussionService,
  DiscussionUnitOfWork,
} from './ports.js';

/** A course with no stored settings. Discussion is opt-in, so the common case
 *  persists no row at all. */
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

  async resolveConfig(
    orgId: string,
    activityId: string,
    courseId: string,
  ): Promise<ResolvedThreadConfig> {
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
Expected: PASS, 6 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/discussion/service.ts packages/server/src/core/discussion/service.test.ts
git commit -m "feat(discussion): resolve course settings and per-activity thread state"
```

---

## Task 5: Posting a comment

**Files:**
- Modify: `packages/server/src/core/discussion/service.ts`
- Modify: `packages/server/src/core/discussion/service.test.ts`

**Interfaces:**
- Consumes: `DiscussionServiceImpl` from Task 4, `Actor` from `./ports.js`.
- Produces: `DiscussionServiceImpl.post(orgId, courseId, actor, input): Promise<Comment>`.

Rules from the spec, all of which need a test:
1. Nothing is accepted when the resolved state is `hidden` or `locked`.
2. Replies are rejected when `threaded` is false.
3. A learner's comment is `pending` when `requireReview`; a staff comment is always `published`.
4. A pending comment is not a reply target.
5. `comment.created` is emitted for every post.

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
    const comment = await service.post('o1', 'c1', learner, {
      activityId: 'a1',
      orgUserId: learner.orgUserId,
      parentId: null,
      body: 'first',
    });
    expect(comment.status).toBe('published');
    expect(comment.courseId).toBe('c1');
    expect(appended).toHaveLength(1);
    expect(appended[0]?.type).toBe('comment.created');
  });

  it('holds a learner comment pending when review is on', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const comment = await service.post('o1', 'c1', learner, {
      activityId: 'a1',
      orgUserId: learner.orgUserId,
      parentId: null,
      body: 'q',
    });
    expect(comment.status).toBe('pending');
  });

  it('publishes a staff comment even when review is on', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const comment = await service.post('o1', 'c1', staff, {
      activityId: 'a1',
      orgUserId: staff.orgUserId,
      parentId: null,
      body: 'answer',
    });
    expect(comment.status).toBe('published');
  });

  it('refuses to post when discussion is disabled for the course', async () => {
    const { service } = makeService();
    await expect(
      service.post('o1', 'c1', learner, {
        activityId: 'a1',
        orgUserId: learner.orgUserId,
        parentId: null,
        body: 'x',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses to post to a locked thread', async () => {
    const { service } = makeService();
    await enabled(service);
    await service.setThreadState('o1', 'a1', 'locked');
    await expect(
      service.post('o1', 'c1', learner, {
        activityId: 'a1',
        orgUserId: learner.orgUserId,
        parentId: null,
        body: 'x',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reply when replies are disabled', async () => {
    const { service } = makeService();
    await enabled(service, { threaded: false });
    const root = await service.post('o1', 'c1', learner, {
      activityId: 'a1',
      orgUserId: learner.orgUserId,
      parentId: null,
      body: 'root',
    });
    await expect(
      service.post('o1', 'c1', learner, {
        activityId: 'a1',
        orgUserId: learner.orgUserId,
        parentId: root.id,
        body: 'reply',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reply to a pending comment', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const pending = await service.post('o1', 'c1', learner, {
      activityId: 'a1',
      orgUserId: learner.orgUserId,
      parentId: null,
      body: 'q',
    });
    await expect(
      service.post('o1', 'c1', staff, {
        activityId: 'a1',
        orgUserId: staff.orgUserId,
        parentId: pending.id,
        body: 'reply',
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reply to a comment on a different activity', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.post('o1', 'c1', learner, {
      activityId: 'a1',
      orgUserId: learner.orgUserId,
      parentId: null,
      body: 'root',
    });
    await expect(
      service.post('o1', 'c1', learner, {
        activityId: 'a2',
        orgUserId: learner.orgUserId,
        parentId: root.id,
        body: 'reply',
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
```

Add the imports this needs to the top of the test file:

```ts
import { ForbiddenError, NotFoundError } from '../shared/errors.js';
import type { Actor } from './ports.js';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts -t "post"`
Expected: FAIL — `service.post is not a function`.

- [ ] **Step 3: Implement `post`**

Add to `DiscussionServiceImpl` in `service.ts`:

```ts
  async post(
    orgId: string,
    courseId: string,
    actor: Actor,
    input: PostCommentInput,
  ): Promise<Comment> {
    const config = await this.resolveConfig(orgId, input.activityId, courseId);
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
      // A pending comment is not a reply target — a subtree must never hang off
      // something no moderator has approved.
      if (parent.status !== 'published') {
        throw new ForbiddenError('cannot reply to a comment that is not published');
      }
    }
    // Review holds learners only; staff publish immediately. The role is read
    // once here and recorded as state, never stored on the row.
    const status: Comment['status'] =
      config.requireReview && !actor.isStaff ? 'pending' : 'published';
    const at = this.now();
    const comment: Comment = {
      id: genId('comment'),
      orgId,
      activityId: input.activityId,
      courseId,
      parentId: input.parentId,
      orgUserId: actor.orgUserId,
      body: input.body,
      status,
      removedBy: null,
      createdAt: at,
      updatedAt: at,
    };
    return this.uow.run(async (scope) => {
      const saved = await scope.discussion.insertComment(orgId, comment);
      await scope.outbox.append([{ type: 'comment.created', orgId, comment: saved }]);
      this.logger.info('comment created', { orgId, commentId: saved.id, status });
      return saved;
    });
  }
```

Add to the imports at the top of `service.ts`:

```ts
import type { PostCommentInput } from './types.js';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts`
Expected: PASS, 14 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/discussion
git commit -m "feat(discussion): post comments with review gate and reply rules"
```

---

## Task 6: Reading a thread

**Files:**
- Modify: `packages/server/src/core/discussion/service.ts`
- Modify: `packages/server/src/core/discussion/service.test.ts`

**Interfaces:**
- Consumes: `post` from Task 5, `ThreadView` from `./ports.js`.
- Produces: `DiscussionServiceImpl.listThread(orgId, activityId, courseId, actor): Promise<ThreadView>`.

Rules, each needing a test:
1. A removed comment with replies is served as a placeholder with `body: null`; with no replies it is not served at all.
2. A pending comment is served to its own author and to staff, never to another learner.
3. `authorIsStaff` comes from the author's current role.
4. Reaction counts are grouped by emoji, with `reacted` true for the reader's own.
5. A hidden thread serves no comments.

- [ ] **Step 1: Write the failing tests**

Append to `service.test.ts`:

```ts
describe('listThread', () => {
  it('serves a removed comment as a placeholder when it has replies', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.post('o1', 'c1', learner, {
      activityId: 'a1', orgUserId: learner.orgUserId, parentId: null, body: 'bad',
    });
    await service.post('o1', 'c1', staff, {
      activityId: 'a1', orgUserId: staff.orgUserId, parentId: root.id, body: 'reply',
    });
    await service.remove('o1', root.id, staff);

    const view = await service.listThread('o1', 'a1', 'c1', learner);
    const placeholder = view.comments.find((c) => c.id === root.id);
    expect(placeholder).toBeDefined();
    expect(placeholder?.body).toBeNull();
    expect(placeholder?.status).toBe('removed');
    expect(placeholder?.removedBy).toBe(staff.orgUserId);
    expect(view.comments).toHaveLength(2);
  });

  it('does not serve a removed comment that has no replies', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.post('o1', 'c1', learner, {
      activityId: 'a1', orgUserId: learner.orgUserId, parentId: null, body: 'oops',
    });
    await service.remove('o1', root.id, learner);
    const view = await service.listThread('o1', 'a1', 'c1', learner);
    expect(view.comments).toHaveLength(0);
  });

  it('serves a pending comment to its author but not to another learner', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const pending = await service.post('o1', 'c1', learner, {
      activityId: 'a1', orgUserId: learner.orgUserId, parentId: null, body: 'q',
    });

    const own = await service.listThread('o1', 'a1', 'c1', learner);
    expect(own.comments.map((c) => c.id)).toContain(pending.id);

    const other: Actor = { orgUserId: 'orm_other', isStaff: false };
    const theirs = await service.listThread('o1', 'a1', 'c1', other);
    expect(theirs.comments).toHaveLength(0);

    const moderator = await service.listThread('o1', 'a1', 'c1', staff);
    expect(moderator.comments.map((c) => c.id)).toContain(pending.id);
  });

  it('marks the author as staff from their current role', async () => {
    const fake = fakeRepo();
    fake.roles.set(staff.orgUserId, 'instructor');
    const { service } = makeService(fake);
    await enabled(service);
    await service.post('o1', 'c1', staff, {
      activityId: 'a1', orgUserId: staff.orgUserId, parentId: null, body: 'hello',
    });
    const view = await service.listThread('o1', 'a1', 'c1', learner);
    expect(view.comments[0]?.authorIsStaff).toBe(true);
  });

  it('groups reactions by emoji and flags the reader own', async () => {
    const { service } = makeService();
    await enabled(service);
    const c = await service.post('o1', 'c1', learner, {
      activityId: 'a1', orgUserId: learner.orgUserId, parentId: null, body: 'hi',
    });
    await service.react('o1', c.id, learner, '👍');
    await service.react('o1', c.id, staff, '👍');

    const view = await service.listThread('o1', 'a1', 'c1', learner);
    expect(view.comments[0]?.reactions).toEqual([{ emoji: '👍', count: 2, reacted: true }]);

    const other: Actor = { orgUserId: 'orm_other', isStaff: false };
    const theirs = await service.listThread('o1', 'a1', 'c1', other);
    expect(theirs.comments[0]?.reactions).toEqual([{ emoji: '👍', count: 2, reacted: false }]);
  });

  it('serves nothing for a hidden thread', async () => {
    const { service } = makeService();
    await enabled(service);
    await service.post('o1', 'c1', learner, {
      activityId: 'a1', orgUserId: learner.orgUserId, parentId: null, body: 'hi',
    });
    await service.setThreadState('o1', 'a1', 'hidden');
    const view = await service.listThread('o1', 'a1', 'c1', learner);
    expect(view.comments).toHaveLength(0);
    expect(view.config.state).toBe('hidden');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts -t "listThread"`
Expected: FAIL — `service.listThread is not a function`. (`remove` and `react` also do not exist yet; they arrive in Tasks 7 and 8. Implement `listThread` now and expect these tests to stay red until Task 8 — that is why Step 4 below only runs the two tests that need nothing else.)

- [ ] **Step 3: Implement `listThread`**

Add to `DiscussionServiceImpl`:

```ts
  async listThread(
    orgId: string,
    activityId: string,
    courseId: string,
    actor: Actor,
  ): Promise<ThreadView> {
    const config = await this.resolveConfig(orgId, activityId, courseId);
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
    // A removed comment survives only to hold its replies in place.
    const withReplies = new Set(
      await this.repo.idsWithReplies(
        orgId,
        readable.filter((c) => c.status === 'removed').map((c) => c.id),
      ),
    );
    const served = readable.filter((c) => c.status !== 'removed' || withReplies.has(c.id));
    const ids = served.map((c) => c.id);
    const [reactions, roles] = await Promise.all([
      config.reactions ? this.repo.listReactions(orgId, ids) : Promise.resolve([]),
      this.repo.rolesOf(orgId, [...new Set(served.map((c) => c.orgUserId))]),
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
      return {
        id: c.id,
        parentId: c.parentId,
        orgUserId: c.orgUserId,
        body: c.status === 'removed' ? null : c.body,
        status: c.status,
        removedBy: c.removedBy,
        authorIsStaff: (roles[c.orgUserId] ?? 'student') !== 'student',
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
git commit -m "feat(discussion): serve a thread with placeholder and pending visibility rules"
```

---

## Task 7: Edit, remove, restore and approve

**Files:**
- Modify: `packages/server/src/core/discussion/service.ts`
- Modify: `packages/server/src/core/discussion/service.test.ts`

**Interfaces:**
- Produces: `edit`, `remove`, `restore`, `approve` on `DiscussionServiceImpl`, all returning `Promise<Comment>`.

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
    const comment = await ctx.service.post('o1', 'c1', learner, {
      activityId: 'a1', orgUserId: learner.orgUserId, parentId: null, body: 'original',
    });
    return { ...ctx, comment };
  }

  it('lets an author edit their own comment', async () => {
    const { service, comment } = await published();
    const edited = await service.edit('o1', comment.id, learner, 'revised');
    expect(edited.body).toBe('revised');
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
    const pending = await service.post('o1', 'c1', learner, {
      activityId: 'a1', orgUserId: learner.orgUserId, parentId: null, body: 'q',
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

  async edit(orgId: string, commentId: string, actor: Actor, body: string): Promise<Comment> {
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
    return updated ?? comment;
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
Expected: PASS — the Task 6 removal tests now have `remove`.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/discussion
git commit -m "feat(discussion): author edit/remove plus moderator restore and approve"
```

---

## Task 8: Reactions

**Files:**
- Modify: `packages/server/src/core/discussion/service.ts`
- Modify: `packages/server/src/core/discussion/service.test.ts`

**Interfaces:**
- Produces: `react(orgId, commentId, actor, emoji): Promise<void>`, `unreact(...)` with the same signature.

Rules: reactions are refused when `reactions` is off or the thread is not `visible`; reacting twice the same way is a no-op; reactions are not evented.

- [ ] **Step 1: Write the failing tests**

Append to `service.test.ts`:

```ts
describe('reactions', () => {
  async function withComment(patch = {}) {
    const ctx = makeService();
    await enabled(ctx.service, patch);
    const comment = await ctx.service.post('o1', 'c1', learner, {
      activityId: 'a1', orgUserId: learner.orgUserId, parentId: null, body: 'hi',
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
  /** Reactions and reports need the same gate: the comment must exist and its
   *  thread must be open. Returns the comment so callers avoid a second read. */
  private async openComment(orgId: string, commentId: string): Promise<Comment> {
    const comment = await this.load(orgId, commentId);
    const config = await this.resolveConfig(orgId, comment.activityId, comment.courseId);
    if (config.state !== 'visible') {
      throw new ForbiddenError('discussion is not open on this activity');
    }
    return comment;
  }

  async react(orgId: string, commentId: string, actor: Actor, emoji: string): Promise<void> {
    const comment = await this.openComment(orgId, commentId);
    const config = await this.resolveConfig(orgId, comment.activityId, comment.courseId);
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
    await this.openComment(orgId, commentId);
    await this.repo.deleteReaction(orgId, commentId, actor.orgUserId, emoji);
  }
```

- [ ] **Step 4: Run the whole suite**

Run: `pnpm vitest run packages/server/src/core/discussion/service.test.ts`
Expected: PASS — all tests, including the Task 6 reaction-grouping test.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/discussion
git commit -m "feat(discussion): reactions with idempotent add and remove"
```

---

## Task 9: Reports and the moderation queue

**Files:**
- Modify: `packages/server/src/core/discussion/service.ts`
- Modify: `packages/server/src/core/discussion/service.test.ts`

**Interfaces:**
- Produces: `report`, `resolveReport`, `queue` on `DiscussionServiceImpl`.

Rules: a report never changes moderation state; one report per person per comment; `comment.reported` is emitted; the queue is staff-only and scopes to a course.

- [ ] **Step 1: Write the failing tests**

Append to `service.test.ts`:

```ts
describe('reports and queue', () => {
  async function withComment() {
    const ctx = makeService();
    await enabled(ctx.service);
    const comment = await ctx.service.post('o1', 'c1', learner, {
      activityId: 'a1', orgUserId: learner.orgUserId, parentId: null, body: 'bad',
    });
    return { ...ctx, comment };
  }

  it('does not change the comment status', async () => {
    const { service, comment } = await withComment();
    await service.report('o1', comment.id, staff, 'abuse');
    const after = await service.listThread('o1', 'a1', 'c1', staff);
    expect(after.comments[0]?.status).toBe('published');
  });

  it('emits comment.reported', async () => {
    const { service, comment, appended } = await withComment();
    await service.report('o1', comment.id, staff, 'abuse');
    expect(appended.at(-1)?.type).toBe('comment.reported');
  });

  it('is one report per person per comment', async () => {
    const { service, comment, reports } = await withComment();
    await service.report('o1', comment.id, staff, 'first');
    await service.report('o1', comment.id, staff, 'second');
    expect(reports).toHaveLength(1);
  });

  it('lists reported comments in a course queue with open counts', async () => {
    const { service, comment } = await withComment();
    const other: Actor = { orgUserId: 'orm_other', isStaff: false };
    await service.report('o1', comment.id, staff, 'a');
    await service.report('o1', comment.id, other, 'b');

    const entries = await service.queue('o1', { kind: 'reported', courseId: 'c1' });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.openReports).toBe(2);
    expect(entries[0]?.comment.id).toBe(comment.id);
  });

  it('drops a comment out of the reported queue once its reports resolve', async () => {
    const { service, comment, reports } = await withComment();
    await service.report('o1', comment.id, staff, 'a');
    await service.resolveReport('o1', reports[0]!.id, staff);
    expect(await service.queue('o1', { kind: 'reported', courseId: 'c1' })).toHaveLength(0);
  });

  it('lists pending comments in the queue', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const pending = await service.post('o1', 'c1', learner, {
      activityId: 'a1', orgUserId: learner.orgUserId, parentId: null, body: 'q',
    });
    const entries = await service.queue('o1', { kind: 'pending', courseId: 'c1' });
    expect(entries.map((e) => e.comment.id)).toEqual([pending.id]);
  });

  it('scopes the queue to the requested course', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    await service.post('o1', 'c1', learner, {
      activityId: 'a1', orgUserId: learner.orgUserId, parentId: null, body: 'q',
    });
    expect(await service.queue('o1', { kind: 'pending', courseId: 'c2' })).toHaveLength(0);
    expect(await service.queue('o1', { kind: 'pending' })).toHaveLength(1);
  });

  it('refuses resolution by a learner', async () => {
    const { service, comment, reports } = await withComment();
    await service.report('o1', comment.id, staff, 'a');
    await expect(service.resolveReport('o1', reports[0]!.id, learner)).rejects.toThrow(
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
    await this.openComment(orgId, commentId);
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
        const existing = await scope.discussion.findReport(orgId, report.id);
        return existing ?? report;
      }
      await scope.outbox.append([{ type: 'comment.reported', orgId, report: saved }]);
      this.logger.info('comment reported', { orgId, commentId });
      return saved;
    });
  }

  async resolveReport(orgId: string, reportId: string, actor: Actor): Promise<CommentReport> {
    if (!actor.isStaff) {
      throw new ForbiddenError('only a moderator may resolve a report');
    }
    const resolved = await this.repo.resolveReport(orgId, reportId, this.now());
    if (!resolved) {
      throw new NotFoundError('CommentReport', reportId);
    }
    return resolved;
  }

  async queue(orgId: string, query: QueueQuery): Promise<QueueEntry[]> {
    const comments =
      query.kind === 'pending'
        ? await this.repo.listByStatus(orgId, 'pending', query.courseId)
        : await this.repo.listReported(orgId, query.courseId);
    const counts = await this.repo.openReportCounts(
      orgId,
      comments.map((c) => c.id),
    );
    return comments.map((comment) => ({ comment, openReports: counts[comment.id] ?? 0 }));
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
Expected: both exit 0. `index.ts` now resolves because `service.ts` exists.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/discussion
git commit -m "feat(discussion): reports as signals plus the moderation queue"
```

---

## Task 10: Drizzle repository

**Files:**
- Create: `packages/server/src/adapters/db/repositories/discussion.ts`

**Interfaces:**
- Consumes: `DiscussionRepository` from `../../../core/discussion/ports.js`, the tables from `../schema/discussion.js`, `orgUsers` from `../schema/organizations.js`.
- Produces: `DrizzleDiscussionRepository`.

- [ ] **Step 1: Write the repository**

Create `packages/server/src/adapters/db/repositories/discussion.ts`:

```ts
// discussion — Drizzle repository (implements the core outbound port).
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DiscussionRepository } from '../../../core/discussion/ports.js';
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
import { orgUsers } from '../schema/organizations.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

type CommentRow = typeof comments.$inferSelect;

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    orgId: row.orgId,
    activityId: row.activityId,
    courseId: row.courseId,
    parentId: row.parentId ?? null,
    orgUserId: row.orgUserId,
    body: row.body,
    status: row.status,
    removedBy: row.removedBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
        courseId: comment.courseId,
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

  async hasReplies(orgId: string, commentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: comments.id })
      .from(comments)
      .where(and(eq(comments.orgId, orgId), eq(comments.parentId, commentId)))
      .limit(1);
    return row !== undefined;
  }

  async idsWithReplies(orgId: string, commentIds: string[]): Promise<string[]> {
    if (commentIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .selectDistinct({ parentId: comments.parentId })
      .from(comments)
      .where(and(eq(comments.orgId, orgId), inArray(comments.parentId, commentIds)));
    return rows.map((r) => r.parentId).filter((id): id is string => id !== null);
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
    return row
      ? {
          id: row.id,
          orgId: row.orgId,
          commentId: row.commentId,
          orgUserId: row.orgUserId,
          reason: row.reason,
          resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
        }
      : null;
  }

  async findReport(orgId: string, id: string): Promise<CommentReport | null> {
    const [row] = await this.db
      .select()
      .from(commentReports)
      .where(and(eq(commentReports.orgId, orgId), eq(commentReports.id, id)))
      .limit(1);
    return row
      ? {
          id: row.id,
          orgId: row.orgId,
          commentId: row.commentId,
          orgUserId: row.orgUserId,
          reason: row.reason,
          resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
        }
      : null;
  }

  async resolveReport(orgId: string, id: string, resolvedAt: string): Promise<CommentReport | null> {
    const [row] = await this.db
      .update(commentReports)
      .set({ resolvedAt: new Date(resolvedAt) })
      .where(and(eq(commentReports.orgId, orgId), eq(commentReports.id, id)))
      .returning();
    return row
      ? {
          id: row.id,
          orgId: row.orgId,
          commentId: row.commentId,
          orgUserId: row.orgUserId,
          reason: row.reason,
          resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
        }
      : null;
  }

  async openReportCounts(orgId: string, commentIds: string[]): Promise<Record<string, number>> {
    if (commentIds.length === 0) {
      return {};
    }
    const rows = await this.db
      .select({ commentId: commentReports.commentId, count: sql<number>`count(*)::int` })
      .from(commentReports)
      .where(
        and(
          eq(commentReports.orgId, orgId),
          inArray(commentReports.commentId, commentIds),
          isNull(commentReports.resolvedAt),
        ),
      )
      .groupBy(commentReports.commentId);
    return Object.fromEntries(rows.map((r) => [r.commentId, r.count]));
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

  async listByStatus(
    orgId: string,
    status: Comment['status'],
    courseId?: string,
  ): Promise<Comment[]> {
    const rows = await this.db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.orgId, orgId),
          eq(comments.status, status),
          ...(courseId ? [eq(comments.courseId, courseId)] : []),
        ),
      )
      .orderBy(comments.createdAt);
    return rows.map(toComment);
  }

  async listReported(orgId: string, courseId?: string): Promise<Comment[]> {
    const openReports = this.db
      .selectDistinct({ commentId: commentReports.commentId })
      .from(commentReports)
      .where(and(eq(commentReports.orgId, orgId), isNull(commentReports.resolvedAt)));
    const rows = await this.db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.orgId, orgId),
          inArray(comments.id, openReports),
          ...(courseId ? [eq(comments.courseId, courseId)] : []),
        ),
      )
      .orderBy(comments.createdAt);
    return rows.map(toComment);
  }

  async rolesOf(orgId: string, orgUserIds: string[]): Promise<Record<string, string>> {
    if (orgUserIds.length === 0) {
      return {};
    }
    const rows = await this.db
      .select({ id: orgUsers.id, role: orgUsers.role })
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), inArray(orgUsers.id, orgUserIds)));
    return Object.fromEntries(rows.map((r) => [r.id, r.role]));
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @headless-lms/server typecheck`
Expected: exits 0.

If `inArray(comments.id, openReports)` fails to typecheck, replace it with a correlated exists instead:

```ts
sql`exists (select 1 from ${commentReports} r where r.org_id = ${comments.orgId} and r.comment_id = ${comments.id} and r.resolved_at is null)`
```

- [ ] **Step 3: Lint and commit**

Run: `pnpm lint`
Expected: exits 0.

```bash
git add packages/server/src/adapters/db/repositories/discussion.ts
git commit -m "feat(discussion): add the Drizzle repository"
```

---

## Task 11: Container wiring

**Files:**
- Modify: `packages/server/src/app/container.ts`

**Interfaces:**
- Consumes: `DiscussionServiceImpl` from `../core/discussion/index.js`, `DrizzleDiscussionRepository`.
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

After the progress block (around line 297), matching its shape:

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

Check the exact `DrizzleOutboxAppender` construction used by the progress UoW at line 288-291 and copy it verbatim — it may take arguments this snippet omits.

- [ ] **Step 4: Typecheck, lint, test**

Run: `pnpm --filter @headless-lms/server typecheck && pnpm lint && pnpm test`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/app/container.ts
git commit -m "feat(discussion): wire the service into the container"
```

---

## Task 12: API contract

**Files:**
- Create: `packages/api-contract/src/discussion.ts`
- Modify: `packages/api-contract/src/index.ts`

**Interfaces:**
- Produces: `ThreadView`, `PostComment`, `EditComment`, `CommentReaction`, `ReportComment`, `DiscussionSettings`, `SetDiscussionSettings`, `SetThreadState`, `ModerationQueue`, `ActivityIdParam`, `CommentIdParam`, `CourseIdParam`, `QueueQuery` Zod schemas.

- [ ] **Step 1: Write the schemas**

Create `packages/api-contract/src/discussion.ts`:

```ts
// Discussion resource schemas. A thread attaches to an activity; settings are
// per course with an optional per-activity thread state.
import { z } from "zod";

export const CommentStatus = z.enum(["pending", "published", "removed"]);
export type CommentStatus = z.infer<typeof CommentStatus>;

export const ThreadState = z.enum(["visible", "hidden", "locked"]);
export type ThreadState = z.infer<typeof ThreadState>;

export const ReactionSummary = z.object({
  emoji: z.string(),
  count: z.number().int(),
  /** True when the requesting person is one of the reactors. */
  reacted: z.boolean(),
});
export type ReactionSummary = z.infer<typeof ReactionSummary>;

export const ThreadComment = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  orgUserId: z.string(),
  /** null for a removed comment — the placeholder carries removedBy instead. */
  body: z.string().nullable(),
  status: CommentStatus,
  removedBy: z.string().nullable(),
  authorIsStaff: z.boolean(),
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

export const Comment = z.object({
  id: z.string(),
  activityId: z.string(),
  courseId: z.string(),
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

export const QueueEntry = z.object({
  comment: Comment,
  openReports: z.number().int(),
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

- [ ] **Step 2: Export from the barrel**

In `packages/api-contract/src/index.ts`, add:

```ts
export * from "./discussion.js";
```

- [ ] **Step 3: Check for export collisions**

`Comment` and `CommentReport` are new top-level names. Confirm nothing else exports them:

```bash
grep -rn "export const Comment\b\|export const CommentReport\b" packages/api-contract/src/
```
Expected: only `discussion.ts`. If another file collides, prefix the discussion ones (`DiscussionComment`) and update the routes in Task 13.

- [ ] **Step 4: Typecheck and commit**

Run: `pnpm --filter @headless-lms/api-contract typecheck`
Expected: exits 0.

```bash
git add packages/api-contract/src/discussion.ts packages/api-contract/src/index.ts
git commit -m "feat(discussion): add API contract schemas"
```

---

## Task 13: HTTP routes

**Files:**
- Create: `packages/server/src/http/routes/discussion.ts`
- Modify: `packages/server/src/http/routes.ts`

**Interfaces:**
- Consumes: `container.discussion`, `resolveScope` from `../scope.js`, `resolveStudentScope` from `../student-scope.js`, `container.content`, `container.reporting.learn`.
- Produces: `discussionRoutes(app, container)`.

**The access gate.** `core/discussion` never calls entitlements — the gate lives here, exactly as `routes/learn.ts` does for `reportProgress`: resolve activity → module → course, then `learn.getCourse(orgId, orgUserId, courseId)`, which returns null unless the person is enrolled. Read `packages/server/src/http/routes/learn.ts:144-164` before writing this task and copy that shape.

- [ ] **Step 1: Write the routes**

Create `packages/server/src/http/routes/discussion.ts`:

```ts
// HTTP routes for discussion. Two audiences on one domain service:
//   - learner routes resolve a student scope and gate on enrollment
//   - moderator routes resolve a staff scope; the domain enforces the rest
// The `Actor` handed to the service carries staff standing resolved here —
// core never looks a role up to make an authorisation decision.
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
): Promise<string> {
  const activity = await container.content.getActivity(orgId, activityId);
  const module = activity && (await container.content.getModule(orgId, activity.moduleId));
  if (!module) {
    throw new NotFoundError('Activity', activityId);
  }
  const course = await container.reporting.learn.getCourse(orgId, orgUserId, module.courseId);
  if (!course) {
    throw new NotFoundError('Activity', activityId);
  }
  return module.courseId;
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
      const courseId = await gate(container, scope.orgId, scope.orgUserId, req.params.activityId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
      return discussion.listThread(scope.orgId, req.params.activityId, courseId, actor);
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
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      const courseId = await gate(container, scope.orgId, scope.orgUserId, req.params.activityId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
      return discussion.post(scope.orgId, courseId, actor, {
        activityId: req.params.activityId,
        orgUserId: scope.orgUserId,
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
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
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
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: true };
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
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: true };
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
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: true };
      return discussion.restore(scope.orgId, req.params.commentId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/discussion/reports/:commentId/resolve',
    schema: {
      operationId: 'resolveCommentReport',
      tags: ['Discussion'],
      summary: 'Resolve a report',
      params: CommentIdParam,
      response: { 200: CommentReport, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: true };
      // `commentId` here is the report id — the param schema is shared.
      return discussion.resolveReport(scope.orgId, req.params.commentId, actor);
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

- [ ] **Step 2: Register**

In `packages/server/src/http/routes.ts`, add the import beside the others:

```ts
import { discussionRoutes } from './routes/discussion.js';
```

and inside the session-guarded plugin, after `await learnRoutes(instance, container);`:

```ts
    await discussionRoutes(instance, container);
```

- [ ] **Step 3: Confirm the settings response shape matches**

`DiscussionSettings` in the contract has no `orgId`, but the service returns one. Fastify validates responses, so an extra key is stripped only if the schema is not strict — verify by starting the server and calling the endpoint:

```bash
pnpm --filter @headless-lms/api dev
```
In another shell, with a valid session cookie:
```bash
curl -s -b "$COOKIE" localhost:8000/api/discussion/courses/<courseId>/settings | jq
```
Expected: a JSON object with `courseId`, `enabled`, `threaded`, `requireReview`, `reactions`. If Fastify 500s on the extra `orgId`, add `orgId: z.string()` to the contract schema and regenerate in Task 14.

- [ ] **Step 4: Typecheck, lint, test**

Run: `pnpm --filter @headless-lms/server typecheck && pnpm lint && pnpm test`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/http/routes/discussion.ts packages/server/src/http/routes.ts
git commit -m "feat(discussion): add learner and moderator HTTP routes"
```

---

## Task 14: Regenerate the SDK

**Files:**
- Modify: `packages/sdk/openapi.json` (generated)
- Modify: `packages/sdk/src/generated/**` (generated)

- [ ] **Step 1: Start the database**

`gen:openapi` boots the real app, so Postgres must be up.

Run: `docker compose -f docker/docker-compose.yml up -d`
Expected: the postgres container is running.

- [ ] **Step 2: Generate**

Run: `pnpm gen:sdk`
Expected: exits 0; `packages/sdk/openapi.json` and `packages/sdk/src/generated/` change.

- [ ] **Step 3: Verify a Discussion class exists**

```bash
grep -rn "class Discussion" packages/sdk/src/generated/ | head
grep -c "getActivityThread\|postComment\|getModerationQueue" packages/sdk/src/generated/*.ts
```
Expected: a `Discussion` class, and all three operation ids present.

- [ ] **Step 4: Full verification**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`
Expected: all four exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk
git commit -m "feat(discussion): regenerate OpenAPI spec and SDK"
```

---

## Self-Review Notes

Checked against `docs/domain/discussion.md`:

| Spec rule | Task |
|---|---|
| Thread attaches to an activity | 2 (schema), 5 (post) |
| Comment records the course it sits within | 1, 2, 5 |
| Three moderation states + who removed | 1, 2, 7 |
| Removed with replies → placeholder; without → not served | 6 |
| Settings per course; thread state per activity; one-step resolution | 4 |
| visible / hidden / locked semantics | 4, 5, 8 |
| Thread state never changes moderation state | 4 (separate paths), 7 |
| Review: pending, learners only, author sees own, no replies to pending | 5, 6 |
| Review evaluated at posting time only | 5 |
| Approval attaches to the comment | 5 (no trust state exists) |
| Reports never change state; one per person per comment | 9 |
| Author full control; edit not evented | 7 |
| Staff-ness read fresh, never stored | 6 (`rolesOf`), 13 (`Actor`) |
| Moderation is any staff participation | 7, 9 (`actor.isStaff`) |
| Queue scoped by course without reading content | 2 (`courseId`), 9 |
| Removing an activity removes its discussion | 2 (cascade FKs) |
| Four events, `comment.removed` names the remover | 1, 5, 7, 9 |
| Reactions/edits/thread-state not evented | 8 (asserted), 7, 4 |
| Entitlements gate | 13 (at the edge, as `learn.ts` does) |

**Two things the spec does not settle, flagged rather than invented:**

1. **Default settings for an unconfigured course.** Task 4 uses `enabled: false`. Confirm before Task 4.
2. **Reply nesting depth.** `threaded` means "replies allowed"; nothing bounds depth, so this plan permits replies to replies. If one level is wanted, add a check in `post` that rejects a reply whose parent already has a parent — a three-line change in Task 5.
