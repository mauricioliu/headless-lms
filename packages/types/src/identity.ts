// identity context — the person.
//
// One row per human, global, mirroring a Better Auth account via `externalId`.
// A person's participation in an organization — including whether they are
// staff or a learner there — is the organizations context's OrgUser, not a
// second identity. See ./organizations.ts.

export interface User {
  readonly id: string;
  // The auth engine's user id (e.g. better-auth). The mirror link.
  readonly externalId: string;
  readonly email: string;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type UserId = string;

export interface RegisterUserInput {
  externalId: string;
  email: string;
  displayName: string;
}
