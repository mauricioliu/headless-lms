// settings — Drizzle repository (implements the core outbound port).
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  SettingsRecord,
  SettingsRepository,
  SettingsValue,
} from '../../../core/shared/settings.js';
import { settings } from '../schema/settings.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

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

  async find(orgId: string, scopeIds: string[], namespace?: string): Promise<SettingsRecord[]> {
    if (scopeIds.length === 0) {
      return [];
    }
    const where = namespace
      ? and(
          eq(settings.orgId, orgId),
          eq(settings.namespace, namespace),
          inArray(settings.scopeId, scopeIds),
        )
      : and(eq(settings.orgId, orgId), inArray(settings.scopeId, scopeIds));

    const rows = await this.db.select().from(settings).where(where);
    this.logger.debug('settings.find', { orgId, namespace, scopeIds, found: rows.length });
    return rows.map(toRecord);
  }

  async patch(
    orgId: string,
    namespace: string,
    scopeId: string,
    patch: SettingsValue,
  ): Promise<SettingsRecord> {
    // Shallow jsonb merge, so a partial patch cannot clobber sibling keys — and
    // so two domains writing different namespaces never contend.
    const [row] = await this.db
      .insert(settings)
      .values({ orgId, namespace, scopeId, value: patch })
      .onConflictDoUpdate({
        target: [settings.orgId, settings.namespace, settings.scopeId],
        set: {
          value: sql`${settings.value} || ${JSON.stringify(patch)}::jsonb`,
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
