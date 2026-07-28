import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  SettingsRecord,
  SettingsRepository,
} from '../../../core/shared/settings.js';
import { settings } from '../schema/settings.js';
import type { Logger } from '@headless-lms/types';
import { noopLogger } from '../../../core/shared/logger.js';
import type { SettingsValue } from '@headless-lms/api-contract';

type Row = typeof settings.$inferSelect;

function toRecord(row: Row): SettingsRecord {
  return {
    namespace: row.namespace,
    scopeId: row.scopeId,
    value: (row.value ?? {}) as SettingsValue,
  };
}

export class DrizzleSettingsRepository implements SettingsRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async find(orgId: string, scopeId: string, namespace?: string): Promise<SettingsRecord[]> {
    const baseConditions = [eq(settings.orgId, orgId), eq(settings.scopeId, scopeId)];
    const where = namespace
      ? and(...baseConditions, eq(settings.namespace, namespace))
      : and(...baseConditions);

    const rows = await this.db.select().from(settings).where(where);
    return rows.map(toRecord);
  }

  async patch(
    orgId: string,
    namespace: string,
    scopeId: string,
    patch: SettingsValue,
  ): Promise<SettingsRecord> {
    // Recursive jsonb merge (see the jsonb_deep_merge migration): a partial
    // patch cannot clobber sibling keys at any depth, only the leaves it names.
    // One statement, so concurrent patches never read-modify-write over each other.
    const [row] = await this.db
      .insert(settings)
      .values({ orgId, namespace, scopeId, value: patch })
      .onConflictDoUpdate({
        target: [settings.orgId, settings.namespace, settings.scopeId],
        set: {
          value: sql`jsonb_deep_merge(${settings.value}, ${JSON.stringify(patch)}::jsonb)`,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error('settings patch returned no row');
    }
    this.logger.debug('settings.patch', { orgId, namespace, scopeId });
    return toRecord(row);
  }
}
