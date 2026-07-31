import type {
  AuthAccountWriter,
  IdentityRepository,
  IdentityService,
  IdentityUnitOfWork,
} from './ports.js';
import type { User } from './model.js';
import type { CreateUserInput, UpdateUserInput } from './types.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';

export class IdentityServiceImpl implements IdentityService {
  private readonly repo: IdentityRepository;
  private readonly logger: Logger;
  private readonly authAccounts?: AuthAccountWriter;
  private readonly uow: IdentityUnitOfWork;

  constructor(input: {
    repo: IdentityRepository;
    logger?: Logger;
    authAccounts?: AuthAccountWriter;
    uow: IdentityUnitOfWork;
  }) {
    this.repo = input.repo;
    this.logger = input.logger ?? noopLogger;
    this.authAccounts = input.authAccounts;
    this.uow = input.uow;
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const created = await this.uow.run(async ({ identity, outbox }) => {
      const user = await identity.insertUser(input);
      await outbox.append([{ type: 'user.created', orgId: '-', user }]);
      return user;
    });
    this.logger.info('user created', { user: created });
    return created;
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<User> {
    const person = await this.repo.findUserById(id);
    if (!person) {
      throw new NotFoundError('User', id);
    }

    const updated = await this.uow.run(async ({ identity, outbox }) => {
      const user = await identity.updateUser(id, input);
      await outbox.append([{ type: 'user.updated', orgId: '-', user }]);
      return user!;
    });
    this.logger.info('user updated', { user: updated });
    return updated;
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

  async handleExternalUserCreated({
    externalId,
    email,
    firstName,
    lastName,
  }: {
    externalId: string;
    email: string;
    firstName: string;
    lastName: string;
  }): Promise<User> {
    const existing = await this.getUserByEmail(email);
    if (existing) {
      const updated = await this.repo.updateUser(existing.id, { externalId, firstName, lastName });
      return updated!;
    }

    return this.createUser({
      externalId,
      email,
      firstName,
      lastName,
    });
  }
}
