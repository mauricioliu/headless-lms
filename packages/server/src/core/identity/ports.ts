// identity context — ports.
import type { User } from './model.js';
import type { CreateUserInput } from './types.js';

// Capability used by the auth adapter to provision a domain person when a
// credential user is created — a narrow slice of the identity service.
export interface UserProvisioner {
  createUser(input: CreateUserInput): Promise<User>;
}

/** Resolves an auth account to the domain person. Used by the organizations
 *  context at invite acceptance, so core never reads the auth schema. */
export interface UserResolver {
  getUserByExternalId(externalId: string): Promise<User | null>;
  /** The person mirror is written 1:1 with account creation, so a hit here
   *  means the email already has an account. */
  getUserByEmail(email: string): Promise<User | null>;
}

// Inbound port (use cases the service exposes).
export interface IdentityService extends UserProvisioner, UserResolver {}

// Outbound port (persistence contract the repository fulfils).
export interface IdentityRepository {
  insertUser(input: CreateUserInput): Promise<User>;
  findUserByExternalId(externalId: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
}
