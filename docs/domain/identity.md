# Identity — Domain Spec

Identity owns the **person**. Every human in the system — whether they run a course business or take a course — has exactly one identity here, and every other context refers back to it by id.

## One model

There is a single model: the **User**, a person. It carries what is true of the human regardless of where they participate — their name, their email, their login.

What a person *is* in a particular organization — staff or learner, and in which role — is not part of their identity. That is their participation, and it belongs to the organizations domain. The same person can be an owner in one organization and a learner in another; those are two participations, one identity.

This matters because the alternative — a separate identity model per population — makes the same human two unrelated records, so their name and email can drift apart, and nothing can refer to "whoever did this" without knowing which population they came from.

## Authentication and system of record

Authentication — credentials, sessions, OAuth — is handled by Better Auth. Better Auth is also the **system of record** for people: it owns the real user data, and the domain's User is a mirror of it.

The mirror is kept in sync from Better Auth: when a user is created there, the corresponding domain person is created — for everyone, learners included. Because Better Auth is the source of truth, replacing it with another provider (e.g. Clerk) would be a **data migration, not a simple swap**.

## Boundaries

1. **identity ↔ Better Auth** — Better Auth authenticates and is the system of record. Identity mirrors the person into the domain and reads authentication from Better Auth.
2. **identity ↔ organizations** — organizations owns participation: which people belong to which organization, and in which role. It references the person by id. A person may exist with no participation at all, and a participation may exist before its person does — an organization can list someone on its roster before they have ever logged in.

## Events

- `user.registered` — a person is created.
- `user.updated` — a person's details change.
- `user.login` — a person signs in.

Participation events (someone joining an organization, being invited, accepting) belong to the organizations domain.

## Build state

Built and **persisted**.
