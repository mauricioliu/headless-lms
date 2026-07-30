// identity — Drizzle repository (implements the core outbound port).
//
// The person only. A person's participation in an organization lives in the
// organizations context (`org_users`), not here.
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { IdentityRepository } from '../../../core/identity/ports.js';
import type { User } from '../../../core/identity/model.js';
import type { CreateUserInput } from '@headless-lms/types';
import { users } from '../schema/identity.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

export class DrizzleIdentityRepository implements IdentityRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async insertUser(input: CreateUserInput): Promise<User> {
    const [row] = await this.db
      .insert(users)
      .values({
        id: input.id,
        externalId: input.externalId,
        email: input.email,
        displayName: input.displayName,
      })
      .returning();
    if (!row) {
      throw new Error('failed to insert user');
    }
    return row;
  }

  async findUserByExternalId(externalId: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.externalId, externalId))
      .limit(1);
    return row ?? null;
  }
}
