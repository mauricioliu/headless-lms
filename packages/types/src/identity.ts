// identity context — the person.
//
// One row per human, global, mirroring a Better Auth account via `externalId`.
// A person's link to an organization — including whether they are staff or a
// learner there — is the organizations context's OrgUser, not a second
// identity. See ./organizations.ts.

import type { DomainEvent } from "./shared.js";
import type { IncomingHttpHeaders } from "node:http";

export type ActiveSession = {
  user: User;
  session: {
    activeOrganizationId?: string | null;
  };
};

export interface SessionVerifier {
  verify(headers: IncomingHttpHeaders): Promise<ActiveSession | null>;
}

export interface AccountProvisioner {
  create(input: {
    email: string;
    password?: string;
    name?: string;
  }): Promise<{ externalId: string }>;
  updateEmail(externalId: string, email: string): Promise<void>;
  setPassword(externalId: string, password: string): Promise<void>;
  revokeSessions(externalId: string): Promise<void>;
  delete(externalId: string): Promise<void>;
}

export interface User {
  readonly id: string;
  // The auth engine's user id.
  readonly externalId: string | null;
  readonly email: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
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
