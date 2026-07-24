import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { genId } from '../../../core/shared/id.js';

export const eventOutbox = pgTable(
  'event_outbox',
  {
    orgId: text('org_id').notNull(),
    id: text('id')
      .primaryKey()
      .$defaultFn(() => genId('event')),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => ({
    pendingIdx: index('event_outbox_pending_idx')
      .on(t.id)
      .where(sql`${t.processedAt} is null`),
  }),
);
