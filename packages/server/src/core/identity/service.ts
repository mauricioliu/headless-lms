// identity context — service implementation (inbound port).
import type { IdentityService, IdentityRepository } from './ports.js';
import type { User } from './model.js';
import type { RegisterUserInput } from './types.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';

export class IdentityServiceImpl implements IdentityService {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly logger: Logger = noopLogger,
  ) {}

  async registerUser(input: RegisterUserInput): Promise<User> {
    const existing = await this.repo.findUserByExternalId(input.externalId);
    if (existing) {
      return existing;
    }
    const user = await this.repo.insertUser(input);
    this.logger.info('user registered', { userId: user.id, externalId: input.externalId });
    return user;
  }

  async getUserByExternalId(externalId: string): Promise<User | null> {
    return this.repo.findUserByExternalId(externalId);
  }
}
