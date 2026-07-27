# Discussion UI Design

Companion to `docs/domain/discussion.md` and the implementation plan at
`docs/superpowers/plans/2026-07-27-discussion-domain.md`. That plan stops at the
generated SDK: it builds the domain, the persistence, the routes and the client,
but nothing renders any of it. This spec covers the two surfaces that consume it
— the comment thread in the student player and the moderation tab in the admin
dashboard — and the contract changes those surfaces force back into the plan.

## The author problem

The plan's `ThreadComment` carries `orgUserId: string` and
`authorIsStaff: boolean`. Neither is renderable: an id is not a name, and a
boolean is not a badge. Both apps would have to invent a second lookup to draw a
comment.

The data model already answers this. A comment's author is an `org_users` row —
that is the FK the plan stores, per the rule that every actor-shaped FK targets
`(org_id, org_user_id)`. The profile hangs off that row through a join both
existing repositories already write, identically:

```ts
orgUsers
  .leftJoin(users, eq(users.id, orgUsers.userId))
  .leftJoin(user,  eq(user.id, users.externalId))
```

`adapters/db/repositories/members.ts:54-56` and
`adapters/db/repositories/students.ts:93-95`. `user.image` — better-auth's
avatar — is why the second hop exists.

So `DiscussionRepository.rolesOf`, already a batched lookup the thread read calls
once (`ports.ts:651`, used at Task 6), becomes `authorsOf` and writes that same
join. It returns the org user with its profile rather than a role string:

```ts
authorsOf(orgId: string, orgUserIds: string[]): Promise<Record<string, CommentAuthor>>
```

where `CommentAuthor` is `{ id, name, image, role }` — `id` the `org_users` id,
`name` composed from the participation's first and last name as the existing
DTOs do, `image` from better-auth, `role` the person's current role in this org.

This preserves the spec rule that staff-ness is read fresh and never stored, and
strengthens it: the role is read at every read, and `authorIsStaff` collapses out
of the contract entirely — a caller-supplied boolean is replaced by a value the
service derives itself. `Member` and `Student` are reporting views over the same
table, not entities, so there is nothing to reuse from them and nothing to
migrate.

Cost: one query, same shape, more columns selected. No extra round trip.

## Contract changes

### `ThreadComment`

- Replace `orgUserId` and `authorIsStaff` with `author: CommentAuthor`.
- Replace `removedBy: string | null` with `removedBy: CommentAuthor | null`, so
  the placeholder on a removed comment names who removed it.

`CommentAuthor` carries no email. Learners read each other's comments, and the
thread must not be a directory of the cohort's addresses.

### `QueueEntry`

The moderation card must render "who, where, what, and why it was flagged". The
plan's entry carries a bare `Comment` and `openReports: number`.

- Add `author: CommentAuthor` and `authorEmail: string`. The email is present
  here and only here: the queue is a staff-scoped route, and identifying a spam
  account is exactly the decision a moderator is being asked to make.
- Add `activityTitle: string`. The card says "Lesson 3"; the comment stores only
  an `activityId`. The route resolves it through `container.content`.
- Replace `openReports: number` with
  `reports: { reporter: CommentAuthor; reason: string; createdAt: string }[]`.
  A count is not actionable. Who flagged it and what they said is the whole
  basis for the decision.

### Reading a per-activity thread state

`setActivityThreadState` exists; nothing reads the override back, so the admin
form has nothing to prefill from. `getActivityThread` returns the resolved
`config.state`, but it is a learner route gated on enrollment — staff cannot
call it.

Add a staff-scoped route:

```
GET /api/discussion/courses/:courseId/thread-states
  → { states: Record<activityId, ThreadState> }
```

Explicit overrides only; an activity absent from the map inherits the course
setting. The Content tab fetches this alongside the course tree. Keeping it on
the discussion resource rather than folding a `discussionState` field into the
activity payload is what keeps the `content` context ignorant of `discussion`.

### Return shapes

`postComment` and `editComment` return the resulting `ThreadComment`, author
resolved. The student thread appends the result rather than refetching, and a
comment held for review renders immediately to its own author as awaiting
review.

## Backend amendments

Two questions the plan flagged rather than invented, now settled:

**Reply nesting is one level.** A reply attaches to a top-level comment. Task 5
rejects a reply whose parent already has a parent. The thread is a list of
comments each owning a flat list of replies — no recursion in the renderer, no
indent ladder to cap on mobile.

**An unconfigured course has discussion disabled.** Task 4 keeps
`enabled: false`. Every course that exists when this ships stays silent until
staff turns it on from the course's Discussion tab.

## Student — the thread under the lesson

New directory `apps/student/src/components/player/discussion/`:

| File | Responsibility |
|---|---|
| `discussion-panel.tsx` | The section rendered under `ContentArea`; owns the config gate and the empty/locked states |
| `comment-list.tsx` | Top-level comments and their replies |
| `comment-item.tsx` | One comment: author, body, age, reactions, own-comment actions |
| `comment-composer.tsx` | The write box, used for both new comments and replies |
| `reaction-bar.tsx` | Emoji counts and the reader's own toggle |
| `use-thread.ts` | Fetch and mutate; owns all thread state |

The thread renders inside the scrolling content area, below the activity and
above `FooterNav` — one scroll context, no new chrome, and no separate mobile
treatment to maintain.

**Fetching is client-side.** `lessonId` changes inside `CoursePlayer` without
navigation, so a server-rendered payload cannot follow it. `use-thread.ts` calls
`ensureClientSdk()` and `Discussion.getActivityThread` on `curLessonId` change —
the pattern `progress-reporter.ts` already uses for the same reason. A request
for a stale lesson is discarded when the lesson changes mid-flight.

**States the panel must render:**

| Condition | Result |
|---|---|
| `config.enabled === false` | Nothing. No heading, no empty state. |
| `state === 'hidden'` | Nothing. |
| `state === 'locked'` | Thread read-only; the composer is replaced by a closed notice. |
| No comments, thread open | Composer plus a short invitation to start. |
| Own comment, `pending` | Rendered to its author only, marked awaiting review. |
| `removed` with replies | Muted placeholder naming the remover, replies kept. |
| `removed` without replies | Never sent by the server; nothing to handle. |

Replying is suppressed on a pending comment — nothing may hang off a comment
that is not yet published.

**Mutations are optimistic with rollback.** Post, edit, delete, react and unreact
apply locally, reconcile against the returned comment, and revert with a message
through the existing `showToast` on failure. Reporting is not optimistic: it
confirms, because the learner needs to know the signal was recorded.

Author display uses `image` when present and falls back to initials via the
existing `initials()` in `apps/student/src/lib/format.ts`. A non-student `role`
draws a badge beside the name.

## Admin — the course Discussion tab

New route `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/`:
`page.tsx` (server component), `_components/settings-form.tsx`,
`_components/queue-list.tsx`, `_components/queue-card.tsx`, and `actions.ts`.
`CourseTabsNav` gains a fifth tab after Access.

**Settings.** Four switches — `enabled`, `threaded`, `requireReview`,
`reactions` — posted through `setDiscussionSettings`. `enabled` off disables the
other three in the form, since they have no effect.

**Queue.** A two-segment control, Pending and Reported, each re-fetching with the
matching `kind`. A card shows the author with avatar and email, the activity
title, the age, the comment body, and — on the reported tab — each report's
reporter and reason. Actions: Approve and Remove on pending; Remove and Dismiss
reports on reported. Removing a comment that was reported resolves its reports in
the same action, so a handled comment leaves both lists.

Both surfaces are server components reading through `server-call.ts`, with
mutations as server actions that call the SDK with `authHeaders()` and then
`revalidatePath("/courses/[courseId]/discussion", "page")` — the pattern
`courses/[courseId]/actions.ts` already establishes.

**Thread state** goes in the existing `item-form-sheet.tsx` as a four-way
control: Course default, Visible, Hidden, Locked. `SetThreadState.state` is
already nullable for exactly the first option. The Content page fetches the
overrides map and passes the activity's current value into the sheet; on save the
sheet calls `saveActivityAction` as it does today and then
`setActivityThreadStateAction` only when the value changed. Thread state is a
discussion-context row, not part of the activity's opaque `settings` blob, so it
cannot ride along in the existing payload.

## Errors

A failed thread fetch renders an inline retry in the panel and leaves the lesson
content untouched — discussion is never allowed to take down the player. A
mutation rejected by the domain (posting into a locked thread, replying to a
pending comment) surfaces the server's message rather than a generic failure,
because those refusals are meaningful to the person reading them. In the admin,
a failed action leaves the card in place and reports through the existing
`sonner` toast.

## Testing

Domain and route behaviour is covered by the existing plan's tests, extended for
the amended shapes: `authorsOf` resolution, the one-level reply rejection, and
the new thread-states route.

For the UI, the logic worth testing is the logic that is not React:
`use-thread.ts` — the config gate, the optimistic apply/rollback, and discarding
a response for a lesson the reader has already left. These are plain functions
over the SDK client and are tested with Vitest against a stubbed client, matching
how `lib/video-tracking.test.ts` covers the player's other stateful hook. The
components themselves are verified by running both apps against a seeded course.
