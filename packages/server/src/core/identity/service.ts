import type { AuthAccountWriter, IdentityService, IdentityRepository } from './ports.js';
import type { User } from './model.js';
import type { CreateUserInput, ProvisionUserInput, UpdateUserInput } from './types.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';

/** The rendering name for someone an admin named. Falls back to the address so
 *  `display_name` is never empty; the person renames themselves later. */
function composeDisplayName(input: ProvisionUserInput): string {
  const composed = [input.firstName, input.lastName].filter(Boolean).join(' ').trim();
  return composed || input.email.split('@')[0]!;
}

export class IdentityServiceImpl implements IdentityService {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly logger: Logger = noopLogger,
    /** Absent in contexts that never edit people (tests, read-only wiring). */
    private readonly authAccounts?: AuthAccountWriter,
  ) {}

  async createUser(input: CreateUserInput): Promise<User> {
    const user = await this.repo.insertUser(input);
    this.logger.info('user registered', { userId: user.id, externalId: input.externalId });
    return user;
  }

  async provisionUser(input: ProvisionUserInput): Promise<User> {
    const existing = await this.repo.findUserByEmail(input.email);
    if (existing) {
      return existing;
    }
    const user = await this.repo.insertUser({
      email: input.email,
      displayName: composeDisplayName(input),
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.lastName !== undefined && { lastName: input.lastName }),
    });
    this.logger.info('user provisioned', { userId: user.id });
    return user;
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<User> {
    const person = await this.repo.findUserById(id);
    if (!person) {
      throw new NotFoundError('User', id);
    }

    const email = input.email?.trim();
    const emailChanged = email !== undefined && email.toLowerCase() !== person.email.toLowerCase();
    if (emailChanged) {
      const holder = await this.repo.findUserByEmail(email!);
      if (holder && holder.id !== person.id) {
        throw new ConflictError('That email address already belongs to someone else');
      }
    }

    // `display_name` is derived, so any name edit has to recompose it. The
    // fallback needs the address that is about to be stored, not the old one.
    const firstName = input.firstName ?? person.firstName ?? undefined;
    const lastName = input.lastName ?? person.lastName ?? undefined;
    const namesChanged = input.firstName !== undefined || input.lastName !== undefined;
    const displayName =
      namesChanged || emailChanged
        ? composeDisplayName({ email: email ?? person.email, firstName, lastName })
        : undefined;

    const updated = await this.repo.updateUser(id, {
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.lastName !== undefined && { lastName: input.lastName }),
      ...(emailChanged && { email: email! }),
      ...(displayName !== undefined && { displayName }),
    });
    if (!updated) {
      throw new NotFoundError('User', id);
    }

    // The auth engine holds its own copy of the address, and it is the one
    // sign-in matches on. A person with no `externalId` has no account yet.
    if (emailChanged && updated.externalId !== null) {
      if (!this.authAccounts) {
        throw new Error('no auth account writer wired — cannot change a linked person’s email');
      }
      await this.authAccounts.updateEmail(updated.externalId, updated.email);
    }

    this.logger.info('user updated', { userId: id, emailChanged });
    return updated;
  }

  async linkUser(userId: string, externalId: string): Promise<User> {
    const person = await this.repo.findUserById(userId);
    if (!person) {
      throw new Error(`no person ${userId} to link`);
    }
    if (person.externalId !== null && person.externalId !== externalId) {
      // Two auth accounts claiming one person is a bug, not a case to absorb:
      // whichever won would silently inherit the other's history.
      throw new ConflictError('That person is already linked to a different account');
    }
    const linked = await this.repo.setExternalId(userId, externalId);
    if (!linked) {
      throw new Error(`failed to link person ${userId}`);
    }
    this.logger.info('user linked', { userId, externalId });
    return linked;
  }

  async getUserByExternalId(externalId: string): Promise<User | null> {
    return this.repo.findUserByExternalId(externalId);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.repo.findUserByEmail(email);
  }

  async getUserById(id: string): Promise<User | null> {
    return this.repo.findUserById(id);
  }
}
