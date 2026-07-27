# Organizations — Domain Spec

Organizations owns the tenant: the organization itself, everyone who belongs to it, and the role each of them holds. It is the tenant root that every other context scopes to. Better Auth's organization plugin is the source of truth for staff membership; core holds a mirror, and staff membership writes go through Better Auth.

**Participation** links a *person* (from the identity domain) to an organization under one role. Staff and learners are the same kind of link, distinguished only by role — a learner is a participant whose role is `student`. This is what makes it possible to say "whoever did this" about any actor in an organization without first asking which population they came from.

## Scope

- Owns the **organization (tenant)**, **participation** (person ↔ org, with a role), **invitation**, **roles**, and **course assignments** (which scope an instructor to specific courses).
- Owns **authorization** — the mapping from a participant's role to what they may do.
- Owns **member management** — inviting, reassigning, and removing the staff who belong to an org — and the **roster**, the learners an organization has added.
- Does **not** own the person record (identity), learner access (entitlements), content (courses), or completion (progress).

## System of record

Better Auth's **organization plugin** is the source of truth for organizations, members, and invitations. Core holds a **read-only mirror**, populated from Better Auth's organization lifecycle. Every member write — invite, reassign, remove — goes **through Better Auth**; core never writes the mirror directly, it reads the mirror and reacts to those changes. Because Better Auth is the source of truth, replacing it would be a **data migration, not a swap**.

## Models

- **Organization** — the tenant. The root every org-scoped record belongs to. Mirrors a Better Auth org.
- **Participation** — links a person to an org and carries their role. For staff it also mirrors a Better Auth member; learners have no Better Auth membership, so nothing to mirror.
- **Invitation** — a pending invite to join an org. Domain-owned, carrying the role the invitee will hold.
- **Course assignment** — links an instructor's participation to a specific course, which is how an instructor's permissions are scoped to the courses they actually teach.

## Roles

Four roles: `owner | admin | instructor | student`. A role answers two questions — what a participant can do, and over which resources.

- **Owner** — full control, including transferring ownership. Org-global. One per org.
- **Admin** — manage courses, members, and settings. Org-global.
- **Instructor** — create and manage the courses assigned to them. **Course-scoped** through a course assignment.
- **Student** — consume content. **Entitlement-scoped**: the role grants nothing on its own; what a learner may open is decided by their entitlements.

The first three are the staff roles, and only they reach the back office.

### Permissions

The table-stakes permission map — the starting set, not a fixed contract.

| Action | Owner | Admin | Instructor | Student |
|---|---|---|---|---|
| Manage org / ownership | ✓ | | | |
| Manage org settings | ✓ | ✓ | | |
| Manage members | ✓ | ✓ | | |
| Create / edit any course | ✓ | ✓ | | |
| Edit assigned course | ✓ | ✓ | ✓ (assigned) | |
| View student progress | ✓ | ✓ | ✓ (assigned) | |
| Consume content | | | | ✓ (entitled) |

## Member management

Owners and admins manage who belongs to an org: invite by email and role, reassign a role, and remove a participant. Ownership is held by exactly one participant and moves only through a deliberate ownership transfer, not the ordinary role-reassignment path. Staff writes go through Better Auth and the mirror follows.

### Invitation and the roster

An invitation creates nothing but itself — everything needed to build the participation travels in the token, and the participation is made at acceptance, when the person is finally known.

The one exception is deliberate: an organization can add a learner to its **roster** before they hold an account at all, so the learner can be granted entitlements ahead of ever logging in. Such a participation has no person behind it yet. When an invitation to that email is accepted, the existing roster entry is claimed rather than duplicated, so the entitlements already granted against it stay attached.

## Boundaries

1. **organizations ↔ Better Auth** — the organization plugin is the source of truth; core holds a read-only mirror, and all member writes go through Better Auth.
2. **organizations ↔ identity** — identity owns the person; organizations references them by id on a participation. A roster entry may reference no person at all until its invitation is accepted. Reference only.
3. **organizations ↔ courses** — a course assignment references a course by id to scope an instructor; organizations never reads course content. Reference only.
4. **organizations → all contexts** — provides the tenant scope and answers authorization lookups. Reference plus authorization.

## Events

Emitted by core when the mirror updates in response to a Better Auth change (core owns these domain events; Better Auth owns the underlying auth action).

- `organization.created`
- `role.assigned`
- `invitation.created`, `invitation.accepted`, `invitation.canceled`
- participation added, removed, and claimed (a roster entry gaining its person at invite acceptance)

## Multi-tenancy

The organization is the tenant root. Every org-scoped record across the system belongs to exactly one organization. People are global; the link between a person and an org is their participation, and it is the target every actor-shaped reference in the system points at.

## Build state

Built and **persisted**.
