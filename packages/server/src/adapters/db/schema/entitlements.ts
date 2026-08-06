
import { pgTable, text, timestamp, primaryKey, foreignKey, unique } from 'drizzle-orm/pg-core';
import type { Entitlement } from '@headless-lms/types/schemas';
import { genId } from '@headless-lms/core/shared/id';
import { organizations, orgUsers } from './organizations.js';
import { contentItems } from './content.js';
import type { Expect, NoDrift } from './drift.js';

export const entitlements = pgTable(
  'entitlements',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('entitlement')),
    orgUserId: text('org_user_id').notNull(),
    contentId: text('content_id').notNull(),
    status: text('status', { enum: ['active', 'revoked'] })
      .notNull()
      .default('active'),
    // Free text: 'manual', 'import', integration ids, …
    source: text('source').notNull().default('manual'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }), // null = lifetime
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // Grants die with their content: deleting the registry row cascades here.
    contentFk: foreignKey({
      columns: [t.orgId, t.contentId],
      foreignColumns: [contentItems.orgId, contentItems.id],
    }).onDelete('cascade'),
    // org_users is org-scoped (composite PK) — the FK must match both columns.
    // Grants die with their org user: deleting the org_users row cascades here.
    orgUserFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }).onDelete('cascade'),
    // One grant per (org, org user, content).
    orgUserContentUq: unique().on(t.orgId, t.orgUserId, t.contentId),
  }),
);

type _EntitlementsDrift = Expect<NoDrift<typeof entitlements.$inferSelect, Entitlement>>;
