import type { IdentityService, IdentityRepository } from './ports.js';
import type { User } from './model.js';
import type { CreateUserInput } from './types.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';

export class IdentityServiceImpl implements IdentityService {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly logger: Logger = noopLogger,
  ) {}

  async createUser(input: CreateUserInput): Promise<User> {
    const user = await this.repo.insertUser(input);
    this.logger.info('user registered', { userId: user.id, externalId: input.externalId });
    return user;
  }

  async getUserByExternalId(externalId: string): Promise<User | null> {
    return this.repo.findUserByExternalId(externalId);
  }
}
