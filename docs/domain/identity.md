# Identity — Domain Spec

Identity owns the **person**. Every human in the system — whether they run a course business or take a course — has an
identity here.

## One model

There is a single model: the **User**, a person. It carries what is true of the human regardless of which organizations they belong to — their name, their email, their login.

What a person *is* in a particular organization — staff or learner, and in which role — is not part of their identity. That is their org user, and it belongs to the organizations domain. The same person can be an owner in one organization and a learner in another; those are two org users, one identity.

This matters because the alternative — a separate identity model per population — makes the same human two unrelated records, so their name and email can drift apart, and nothing can refer to "whoever did this" without knowing which population they came from.

## Authentication and system of record

Identity owns the auth use cases - resolveSession, provisionAccount, requestPasswordReset

## Boundaries

1. **identity ↔ Better Auth** — Better Auth authenticates; identity owns the person and holds a link to their account, which is absent until they have one. Whether an address can sign in is Better Auth's answer.
2. **identity ↔ organizations** — organizations owns the org user: which people belong to which organization, and in which role. It references the person by id, always. A person may exist with no org user at all, but never the reverse.

## Events

- `user.registered` — a person is created.
- `user.updated` — a person's details change.
- `user.login` — a person signs in.

A person gaining an account is not an identity event: what changes materially is what they can do in an organization, so the organizations domain announces it.

Org user events (someone joining an organization, being invited, accepting) belong to the organizations domain.

## Build state

Built and **persisted**.
