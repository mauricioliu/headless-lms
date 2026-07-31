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
  // auth engine's ID - e.g. better-auth. NULL until the person authenticates:
  // an invited student is known to the org before any account exists, and the
  // auth adapter's create hook fills this in by email when they sign up.
  externalId: text('external_id').unique(),

  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  // As entered on the invite form. `display_name` is the composed rendering
  // name and drifts once the person edits their profile; these do not.
  firstName: text('first_name'),
  lastName: text('last_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
