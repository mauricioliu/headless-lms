import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { genId } from '../../../core/shared/id.js';
import { users } from './identity.js';

export const organizations = pgTable('organizations', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => genId('organization')),
  // Links to the better-auth organization record.
  externalId: text('external_id').unique(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// A person's link to an organization under one role
export const orgUsers = pgTable(
  'org_users',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('orgUser')),

    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role', { enum: ['owner', 'admin', 'instructor', 'student'] }).notNull(),
    // 'invited' from the moment an admin adds a student until they accept.
    // Staff rows are mirrored from an auth member record that only exists once
    // they have joined, so they are created 'active'.
    status: text('status', { enum: ['invited', 'active'] })
      .notNull()
      .default('active'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    userUq: unique().on(t.orgId, t.userId),
  }),
);

export const invites = pgTable(
  'invites',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('invite')),
    email: text('email').notNull(),
    role: text('role', { enum: ['admin', 'instructor', 'student'] }).notNull(),
    status: text('status', {
      enum: ['pending', 'accepted', 'rejected', 'canceled'],
    }).notNull(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // One pending invite per (org, email) — the upsert's conflict target.
    pendingEmailUq: uniqueIndex('invites_pending_email_uq')
      .on(t.orgId, t.email)
      .where(sql`${t.status} = 'pending'`),
  }),
);

