// identity context — the person.
//
// One row per human, global, mirroring a Better Auth account via `externalId`.
// A person's link to an organization — including whether they are staff or a
// learner there — is the organizations context's OrgUser, not a second
// identity. See ./organizations.ts.

export interface User {
  readonly id: string;
  // The auth engine's user id (e.g. better-auth). The mirror link.
  readonly externalId: string;
  readonly email: string;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UserProfile {
  readonly id: string;
  name: string;
  email: string;
  image: string | null;
}

export type UserId = string;

export type CreateUserInput = {
  id?: string;
  externalId: string;
  email: string;
  displayName: string;
};
