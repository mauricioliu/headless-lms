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
import { NotFoundError } from '../shared/errors.js';
import type { Mailer } from '@headless-lms/server';

export class IdentityServiceImpl implements IdentityService {
  private readonly repo: IdentityRepository;
  private readonly logger: Logger;
  private readonly authAccounts?: AuthAccountWriter;
  private readonly uow: IdentityUnitOfWork;
  private readonly mailer: Pick<Mailer, 'send'>;

  constructor(input: {
    repo: IdentityRepository;
    logger?: Logger;
    authAccounts?: AuthAccountWriter;
    mailer: Mailer;
    uow: IdentityUnitOfWork;
  }) {
    this.repo = input.repo;
    this.mailer = input.mailer;
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

  async sendPasswordReset(input: { email: string; url: string }): Promise<void> {
    await this.mailer.send(input.email, 'passwordReset', { resetUrl: input.url });
  }

  async sendMagicLink(input: { email: string; url: string }): Promise<void> {
    await this.mailer.send(input.email, 'magicLink', { url: input.url });
  }
}
