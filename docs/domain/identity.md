# Identity — Domain Spec

Identity owns the **person**. Every human in the system — whether they run a course business or take a course — has exactly one identity here, and every other context refers back to it by id.

## One model

There is a single model: the **User**, a person. It carries what is true of the human regardless of which organizations they belong to — their name, their email, their login.

What a person *is* in a particular organization — staff or learner, and in which role — is not part of their identity. That is their org user, and it belongs to the organizations domain. The same person can be an owner in one organization and a learner in another; those are two org users, one identity.

This matters because the alternative — a separate identity model per population — makes the same human two unrelated records, so their name and email can drift apart, and nothing can refer to "whoever did this" without knowing which population they came from.

## Authentication and system of record

Authentication — credentials, sessions, OAuth — is handled by Better Auth. Better Auth is the **system of record for authentication**: it owns credentials and sessions, and a User carries a link to its account there.

That link is optional, because a person can be known before they can sign in. An admin who adds a learner names a real human, and that human is a person here from that moment, with no account behind them. When they eventually sign up, the account attaches to the waiting person — matched on their address — rather than making a second record of the same human. Until it does, the person is simply someone the organization knows about.

So the question "does this address have an account?" is Better Auth's to answer, not this domain's: a person here may be someone who has never signed in. Because Better Auth owns authentication, replacing it with another provider (e.g. Clerk) would be a **data migration, not a simple swap**.

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
