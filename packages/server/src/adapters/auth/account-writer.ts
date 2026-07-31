// Writes to better-auth's own account row, fulfilling the identity context's
// AuthAccountWriter port.
//
// A person's address lives on both sides of the mirror: `users.email` in the
// domain, `ba_user.email` in the auth engine. Sign-in matches on the auth
// side, so a domain-only change would leave someone signing in under an
// address the org no longer knows.
//
// Straight at the table rather than through `auth.api`: better-auth's own
// change-email flow is session-bound and verification-gated — it answers "I am
// changing my address", not "an admin is correcting yours".
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { AuthAccountWriter } from '../../core/identity/index.js';
import { ConflictError } from '../../core/shared/errors.js';
import type { Logger } from '../../core/shared/ports.js';
import { noopLogger } from '../../core/shared/logger.js';
import { user } from './schema.js';

/** Postgres unique-violation. The domain checks for a collision first, so
 *  reaching this means the two sides had drifted. */
const UNIQUE_VIOLATION = '23505';

export class DrizzleAuthAccountWriter implements AuthAccountWriter {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async updateEmail(externalId: string, email: string): Promise<void> {
    try {
      await this.db
        .update(user)
        .set({ email, emailVerified: false, updatedAt: new Date() })
        .where(eq(user.id, externalId));
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictError('That email address already belongs to another account');
      }
      throw err;
    }
    this.logger.info('auth account email updated', { externalId });
  }
}
