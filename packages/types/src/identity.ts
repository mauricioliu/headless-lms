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

export type UserId = string;

export interface RegisterUserInput {
  externalId: string;
  email: string;
  displayName: string;
}
