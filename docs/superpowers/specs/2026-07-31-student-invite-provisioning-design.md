# Student invite provisioning — design

Date: 2026-07-31

## Problem

Inviting a student creates an `invites` row and nothing else. The student does
not exist anywhere else in the system until they click the emailed link and sign
up, at which point Better Auth's `user.create.after` hook mirrors them into
`users` and `acceptInvite` creates their `org_users` row.

So between invite and acceptance there is no student. They cannot be found, they
cannot be granted an entitlement, they do not appear in the students report, and
the admin has no record to point at. The admin asked for a student, and got a
pending email.

## Approach

Inviting a student provisions the domain person and their `org_users` row
immediately. Authentication is separate from the domain, so this does not
require a Better Auth account: a domain `users` row with no `external_id` is a
person the organization knows about who has never authenticated.

When that person eventually signs up, Better Auth's existing user-creation hook
**links** the new auth user to the waiting domain person by email instead of
inserting a second one.

Staff invites (`admin`, `instructor`) are unchanged. Their `org_users` row is
mirrored from Better Auth's member record by the `afterAddMember` org hook, so
pre-creating one would collide on the `(org_id, user_id)` unique constraint.

---

## 1. Identity — a person can exist before an auth account

### Schema

`users.external_id`: `NOT NULL` → nullable. The unique constraint stays (Postgres
unique indexes permit multiple NULLs). A NULL means "provisioned, never
authenticated".

`users` gains two nullable columns:

| column       | type   | notes                                    |
|--------------|--------|------------------------------------------|
| `first_name` | `text` | nullable — as entered on the invite form |
| `last_name`  | `text` | nullable — as entered on the invite form |

`display_name` stays `NOT NULL` and remains the composed rendering name
(`"${firstName} ${lastName}".trim()`, falling back to the email local part when
both are absent). Keeping the parts separate means a student later editing their
display name does not destroy the admin's structured entry.

### Types (`packages/types/src/identity.ts`)

```ts
export interface User {
  readonly id: string;
  readonly externalId: string | null;   // was: string
  readonly email: string;
  readonly displayName: string;
  readonly firstName: string | null;    // new
  readonly lastName: string | null;     // new
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type CreateUserInput = {
  id?: string;
  externalId?: string;                  // was required
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
};

/** Provision a person the org knows about who has not authenticated yet. */
export type ProvisionUserInput = {
  email: string;
  firstName?: string;
  lastName?: string;
};
```

### Ports (`core/identity/ports.ts`)

`UserProvisioner` grows one use case; a new `UserLinker` covers the link:

```ts
export interface UserProvisioner {
  createUser(input: CreateUserInput): Promise<User>;
  /** Find by email, insert unlinked if absent. Idempotent. */
  provisionUser(input: ProvisionUserInput): Promise<User>;
}

export interface UserLinker {
  /** Attach an auth account to a person provisioned earlier. */
  linkUser(userId: string, externalId: string): Promise<User>;
}

export interface IdentityService extends UserProvisioner, UserResolver, UserLinker {}

export interface IdentityRepository {
  insertUser(input: CreateUserInput): Promise<User>;
  setExternalId(userId: string, externalId: string): Promise<User | null>;
  findUserByExternalId(externalId: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
}
```

`provisionUser` reuses an existing person when the email already has one — a
student invited into a second organization is the same human, and `users.email`
is globally unique. `findUserByEmail` is already case-insensitive.

`linkUser` fails loudly if the person is already linked to a different
`external_id`; that would mean two auth accounts claim one person and is a bug,
not a case to absorb silently.

---

## 2. The auth hook links instead of always inserting

`adapters/auth/index.ts`, `databaseHooks.user.create.after`, today:

```ts
after: async (user) => {
  await opts.identity.createUser({
    id: user.id, externalId: user.id, email: user.email, displayName: user.name,
  });
}
```

becomes:

```ts
after: async (user) => {
  const existing = await opts.identity.getUserByEmail(user.email);
  if (existing && existing.externalId === null) {
    await opts.identity.linkUser(existing.id, user.id);
    await opts.organizations.markStudentLinked(existing.id, user.id);
    return;
  }
  if (existing) return;   // already linked — nothing to mirror
  await opts.identity.createUser({
    id: user.id, externalId: user.id, email: user.email, displayName: user.name,
  });
}
```

**`id` and `external_id` stop coinciding** for linked people. Nothing depends on
their equality: every read goes through `findUserByExternalId` or
`findUserByEmail`, and the avatar join in `adapters/db/repositories/students.ts`
is already `leftJoin(user, eq(user.id, users.externalId))`, so an unlinked
student simply resolves to a null image.

`OrganizationProvisioner` — the narrow organizations slice the auth adapter
already holds — gains one method for the event:

```ts
/** A provisioned student attached an auth account. Appends student.linked
 *  for every org the person is a student in. */
markStudentLinked(userId: string, userExternalId: string): Promise<void>;
```

The auth user's `name` does **not** overwrite `display_name`. The admin entered
the student's name deliberately; a self-signup name is not more authoritative
than that, and the student can change their display name through the portal.

---

## 3. `accountExists` reads Better Auth, not the mirror

The invite lookup currently answers "does this address already have an account?"
with `identity.getUserByEmail(...) !== null`. Once invites provision a domain
person, that is always true and every invitee would be pushed to the sign-in
form.

The mirror can no longer answer the question, so ask the authority. A new
outbound port declared in `core/organizations/ports.ts` (core owns the port,
adapters implement it):

```ts
/** Outbound: does this address have an auth account? Only the auth engine
 *  knows — the domain mirror now holds people who have never authenticated. */
export interface AuthAccounts {
  exists(email: string): Promise<boolean>;
}
```

Implemented in `adapters/auth` as a case-insensitive lookup against `ba_user`,
and wired into `OrganizationServiceImpl` through the container.

---

## 4. `org_users` gains a status

| column   | type   | notes                                          |
|----------|--------|------------------------------------------------|
| `status` | `text` | `'invited' \| 'active'`, NOT NULL, default `'active'` |

The migration backfills existing rows to `'active'`. Student rows created at
invite time start `'invited'`; acceptance flips them to `'active'`.

```ts
export interface OrgUser {
  readonly id: string;
  readonly orgId: string;
  readonly userId: string;
  readonly role: Role;
  readonly status: OrgUserStatus;        // new
  readonly externalId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type OrgUserStatus = "invited" | "active";
```

`CreateOrgUserInput` gains `status`, defaulting to `'active'` so staff paths are
unaffected.

---

## 5. Invite creation provisions the student

### Contract (`packages/api-contract/src/invites.ts`)

```ts
export const CreateInvite = z.object({
  email: z.email(),
  role: InviteRole,
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  /** Create the record either way; suppress delivery when false. */
  sendEmail: z.boolean().default(true),
});
```

`CreateInviteInput` in `packages/types/src/organizations.ts` gains the same three
fields.

### Service (`core/organizations/service.ts`)

`createInvite` branches once, on role:

```ts
async createInvite(input: CreateInviteInput): Promise<Invite> {
  const { orgId, email, role, inviterUserId, firstName, lastName, sendEmail } = input;
  const { token, tokenHash } = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  // A student is a person the org knows about from the moment they are
  // invited — provisioned before the invite so the org_users row can point
  // at them inside the same transaction.
  const person = role === STUDENT_ROLE
    ? await this.people.provisionUser({ email, firstName, lastName })
    : null;

  const invite = await this.uow.run(async ({ organizations, outbox }) => {
    const row = await organizations.upsertPendingInvite(orgId, {
      email, role, invitedBy: inviterUserId, tokenHash, expiresAt,
    });
    const events: OrganizationEvent[] = [{ type: 'invite.created', orgId, invite: row }];

    if (person) {
      // Idempotent on (org_id, user_id): re-inviting the same address rotates
      // the token without producing a second org user.
      const { orgUser, created } = await organizations.ensureOrgUser({
        orgId, userId: person.id, role: STUDENT_ROLE, status: 'invited',
      });
      if (created) events.push({ type: 'student.created', orgId, student: orgUser });
    }

    await outbox.append(events);
    return row;
  });

  if (sendEmail) {
    await this.sendInviteEmail(invite, token);
  }
  return invite;
}
```

`PersonResolver` in `core/organizations/ports.ts` widens to cover provisioning:

```ts
export interface PersonResolver {
  getUserByExternalId(externalId: string): Promise<{ id: string; displayName: string } | null>;
  provisionUser(input: ProvisionUserInput): Promise<{ id: string; displayName: string }>;
}
```

`OrganizationsRepository` gains `ensureOrgUser`, an upsert on `(org_id, user_id)`
returning whether it inserted, so the event fires exactly once per student.

`sendEmail: false` changes nothing but delivery — the invite row, the token and
the student record are identical. The admin re-sends later from the profile.

---

## 6. Acceptance activates rather than creates

`acceptInvite` currently always calls `createOrgUser`. It becomes:

```ts
const orgUser = await this.uow.run(async ({ organizations, outbox }) => {
  const { orgUser: row, created } = await organizations.ensureOrgUser({
    orgId: invite.orgId, userId: input.userId, role: invite.role, status: 'active',
  });
  await organizations.setInviteStatus(invite.orgId, invite.id, 'accepted');
  // Only the staff path creates here; a provisioned student's row already
  // announced itself at invite time.
  if (created) {
    await outbox.append([{ type: 'student.created', orgId: invite.orgId, student: row }]);
  }
  return row;
});
```

`ensureOrgUser` promotes an existing `'invited'` row to `'active'`; for staff, who
have no row yet, it inserts one directly as `'active'`.

### Events

`student.created` now fires when the `org_users` row appears — invite time for
students, acceptance for staff. It no longer fires at acceptance for a student
who was provisioned at invite time, because nothing was created.

`student.linked` fills the gap. It is already declared in
`core/automations/catalog.ts:42` ("a pending student was linked to an auth
account") but its type was dropped from `packages/types/src/organizations.ts` —
this reinstates it:

```ts
/** A provisioned student attached an auth account (first sign-up / sign-in). */
export interface StudentLinked extends DomainEvent {
  type: "student.linked";
  userId: string;
  userExternalId: string;
}
```

Automations that previously keyed off `student.created` to mean "a student can
now log in" should move to `student.linked`. `student.created` now means "the org
has a record for this person".

---

## 7. `resolveInvite` → `getInvite`

The call is a read keyed by a token; the verb should say so.

| before | after |
|---|---|
| `POST /api/organizations/invites/resolve` | `GET /api/organizations/invites/:token` |
| `operationId: resolveInvite` | `operationId: getInvite` |
| `ResolveInvite` / `ResolveInviteResult` | `GetInviteResult` |

```ts
export const GetInviteResult = z.object({
  email: z.string(),
  /** The name the admin entered, to prefill sign-up. */
  name: z.string(),
  /** From the auth engine — the mirror can no longer answer this. */
  accountExists: z.boolean(),
});
```

Unguarded, as today: the invitee has no session yet. A forged, expired or
already-accepted token still 404s with the same body, so a probe learns nothing.

The handler reads `accountExists` from `AuthAccounts.exists(invite.email)` and
`name` from the provisioned person.

The student app's `welcome/page.tsx` calls `Organizations.getInvite({ token })`
and passes `name` down to `CreateAccountForm` as the default value for its name
field, which stays editable.

**Security note.** A token in the URL path is written to access logs, proxy logs
and browser history in a way a POST body is not. The token is single-use and
short-lived, which bounds the exposure, but this is a deliberate trade the GET
buys.

---

## 8. Read model and API

`reporting/students` — `Student` gains the status:

```ts
export interface Student extends OrgUserProfile {
  entitlementCount: number;
  avgProgress: number;
  status: OrgUserStatus;      // new
  joinedAt: string;
  lastActiveAt: string | null;
}
```

`DrizzleStudentsRepository` selects `orgUsers.status` in both `list` and
`findById`, and adds it to the `groupBy` (the composite PK does not functionally
determine it under the aggregate). The `Student` schema in
`packages/api-contract/src/students.ts` gains
`status: z.enum(["invited", "active"])`.

### Resend

```
POST /api/students/:id/invite/resend  →  204
```

Guarded by `requireOrgSession`. The handler resolves the `org_users` row to its
person's email and calls `organizations.createInvite({ orgId, email,
role: 'student', inviterUserId, sendEmail: true })` — which already upserts the
pending invite, rotating the token, and now finds the existing `org_users` row
idempotently. 404 when the student does not exist; 409 when they are already
`'active'` (nothing to resend).

---

## 9. Admin UI

### Add student dialog

`students/_components/add-student-dialog.tsx` — the form grows to four controls:

```
First name   [            ]   Last name    [            ]
Email        [                                          ]
[x] Send invite email
```

```ts
const schema = z.object({
  firstName: z.string().trim().min(1, "Enter a first name"),
  lastName: z.string().trim().min(1, "Enter a last name"),
  email: z.email("Enter a valid email"),
  sendEmail: z.boolean(),
});
```

Names are required on the form even though the columns are nullable — the column
is nullable for people who arrive by self-signup, not to let an admin skip them.

Dialog copy changes from "Invite student" to "Add student", since the student now
exists whether or not an email goes out. The success toast reflects the flag:
"Invite sent" vs "Student added".

`inviteStudentAction` passes the four fields straight through.

### Student profile header

`students/[studentId]/student-detail-view.tsx` — when `student.status === "invited"`:

- an "Invite pending" badge beside the name
- a **Resend invite** button in the header, next to the existing delete action

Resend calls a new `resendStudentInviteAction(studentId)` server action, toasts
on success, and leaves the page. The existing `ConfirmDialog` delete path is
unchanged; deleting a pending student cancels their pending invite in the same
transaction as the `org_users` delete.

---

## Testing

**`core/identity/service.test.ts`**
- `provisionUser` inserts an unlinked person when the email is unknown
- `provisionUser` returns the existing person when the email is known, without a second insert
- `linkUser` sets `external_id`, and throws when the person is already linked to a different account

**`core/organizations/service.test.ts`**
- a student invite provisions a person and an `'invited'` org user, and appends `invite.created` + `student.created`
- a staff invite provisions neither, and appends only `invite.created`
- re-inviting the same student rotates the token, appends `invite.created` only, and leaves one org user
- `sendEmail: false` produces the same rows and events, and calls the mailer zero times
- `acceptInvite` promotes an `'invited'` row to `'active'` without creating a second one
- `acceptInvite` for staff creates an `'active'` row as before

**`adapters/auth`** — hook behaviour
- signing up with an email that has an unlinked person links it rather than inserting
- signing up with an unknown email inserts as today
- signing up with an email that has a linked person is a no-op

**`adapters/db/repositories/students.ts`** — an invited student appears in `list`
and `findById` with `status: 'invited'` and a null image, given no `ba_user` row.

## Migration

One Drizzle migration:

1. `ALTER TABLE users ALTER COLUMN external_id DROP NOT NULL`
2. `ALTER TABLE users ADD COLUMN first_name text, ADD COLUMN last_name text`
3. `ALTER TABLE org_users ADD COLUMN status text NOT NULL DEFAULT 'active'`

Existing data is correct under the new schema without backfill: every current
`users` row has an `external_id`, and every current `org_users` row is active.

## Loose end

`RedeemInvite` and `RedeemInviteResult` in `packages/api-contract/src/invites.ts`
are dead — no route serves them and nothing calls them. Not touched here.
