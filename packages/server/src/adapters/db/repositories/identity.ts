// identity — Drizzle repository (implements the core outbound port).
//
// The person only. A person's link to an organization lives in the
// organizations context (`org_users`), not here.
import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { IdentityRepository } from '../../../core/identity/ports.js';
import type { User } from '@headless-lms/types';
import type { CreateUserInput, UpdateUserInput } from '@headless-lms/types';
import { users } from '../schema/identity.js';
import type { Logger } from '@headless-lms/types';
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
        externalId: input.externalId ?? null,
        email: input.email,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
      })
      .returning();
    if (!row) {
      throw new Error('failed to insert user');
    }
    return row;
  }

  async updateUser(
    id: string,
    input: UpdateUserInput,
  ): Promise<User | null> {
    // An empty patch would be an UPDATE with no SET — read the row back instead.
    if (Object.keys(input).length === 0) {
      return this.findUserById(id);
    }
    const [row] = await this.db.update(users)
      .set(input)
      .where(eq(users.id, id))
      .returning();
    return row ?? null;
  }

  async findUserById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }

  async findUserByExternalId(externalId: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.externalId, externalId))
      .limit(1);
    return row ?? null;
  }

  // Case-insensitive: the address comes from whatever an admin typed into an
  // invite, the row from whatever the auth provider stored.
  async findUserByEmail(email: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`)
      .limit(1);
    return row ?? null;
  }
}
