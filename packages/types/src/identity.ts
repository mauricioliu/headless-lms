// identity context — the person.
//
// One row per human, global, mirroring a Better Auth account via `externalId`.
// A person's link to an organization — including whether they are staff or a
// learner there — is the organizations context's OrgUser, not a second
// identity. See ./organizations.ts.

export interface User {
  readonly id: string;
  // The auth engine's user id (e.g. better-auth). The mirror link.
  // Null until the person authenticates: a student invited by an admin is
  // known to the org before any account exists.
  readonly externalId: string | null;
  readonly email: string;
  readonly displayName: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
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
  externalId?: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
};

/** A person the org knows about who has not authenticated yet. */
export type ProvisionUserInput = {
  email: string;
  firstName?: string;
  lastName?: string;
};

/** The person fields an admin can correct. Omitted keys are left alone;
 *  `displayName` is not among them — it is recomposed from the names. */
export type UpdateUserInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
};
