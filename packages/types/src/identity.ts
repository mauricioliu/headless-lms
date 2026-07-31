// identity context — the person.
//
// One row per human, global, mirroring a Better Auth account via `externalId`.
// A person's link to an organization — including whether they are staff or a
// learner there — is the organizations context's OrgUser, not a second
// identity. See ./organizations.ts.

import type { DomainEvent } from "./shared";

export interface User {
  readonly id: string;
  // The auth engine's user id (e.g. better-auth). The mirror link.
  // Null until the person authenticates: a student invited by an admin is
  // known to the org before any account exists.
  readonly externalId: string | null;
  readonly email: string;
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
  firstName?: string;
  lastName?: string;
};

/** A person the org knows about who has not authenticated yet. */
export type ProvisionUserInput = {
  email: string;
  firstName?: string;
  lastName?: string;
};

export type UpdateUserInput = {
  externalId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};


export interface UserCreated extends DomainEvent {
  type: "user.created";
  user: User;
}

export interface UserUpdated extends DomainEvent {
  type: "user.updated";
  user: User;
}

export interface UserDeleted extends DomainEvent {
  type: "user.deleted";
  user: User;
}

export type UserEvent = UserCreated | UserUpdated | UserDeleted;
