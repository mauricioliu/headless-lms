// identity context — ports.
import type { User } from './model.js';
import type { CreateUserInput, UpdateUserInput } from './types.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';

export interface UserProvisioner {
  createUser(input: CreateUserInput): Promise<User>;
  handleExternalUserCreated(params: {
    externalId: string;
    email: string;
    firstName: string;
    lastName: string;
  }): Promise<User>;
}

/** Resolves an auth account to the domain person. Used by the organizations
 *  context at invite acceptance, so core never reads the auth schema. */
export interface UserResolver {
  getUserByExternalId(externalId: string): Promise<User | null>;
  /** A hit says a person exists, NOT that they can sign in — provisioned
   *  students have no account until `externalId` is filled in. */
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;
}

/** Corrects the person an admin named. Throws ConflictError when a new address
 *  already belongs to somebody else. */
export interface UserEditor {
  updateUser(id: string, input: UpdateUserInput): Promise<User>;
}

// Inbound port (use cases the service exposes).
export interface IdentityService extends UserProvisioner, UserResolver, UserEditor {}

/** Outbound: the auth engine's own account row, which mirrors the person's
 *  address. Only reached for people who have actually authenticated — an
 *  invited student has no account, so there is nothing there to keep in step. */
export interface AuthAccountWriter {
  /** Points the auth account at a new address. `emailVerified` goes back to
   *  false: an address an admin typed is one nobody has proven they own. */
  updateEmail(externalId: string, email: string): Promise<void>;
}

// Outbound port (persistence contract the repository fulfils).
export interface IdentityRepository {
  insertUser(input: CreateUserInput): Promise<User>;
  updateUser(id: string, input: UpdateUserInput): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  findUserByExternalId(externalId: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
}

export interface IdentityTxScope {
  identity: IdentityRepository;
  outbox: OutboxAppender;
}

export type IdentityUnitOfWork = UnitOfWork<IdentityTxScope>;
