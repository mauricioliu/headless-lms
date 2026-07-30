// identity tables — the person.
//
// One row per human, global, mirroring a Better Auth account via `external_id`.
// Belonging to an organization (staff or learner, and in which role) is
// `org_users` in the organizations context — not a second identity table.
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { genId } from '../../../core/shared/id.js';

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => genId('user')),
  // auth engine's ID - e.g. better-auth
  externalId: text('external_id').notNull().unique(),

  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
