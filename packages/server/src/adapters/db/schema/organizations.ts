// organizations tables — the domain mirror of the auth adapter's organization
// plugin. `organizations` is the tenant root (every org-scoped table FKs to it);
// org users and invitations carry a composite (org_id, id) key.
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
  externalId: text('external_id').notNull().unique(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// A person's participation in one organization under one role — the single
// org-scoped actor for staff and learners alike. Everything actor-shaped
// (entitlements, progress) FKs (org_id, id) here.
export const orgUsers = pgTable(
  'org_users',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('orgUser')),

    // The person. NULL for a roster entry an admin created before the human
    // ever logged in — invitations never create rows, so this is the only
    // way a participation exists without an account behind it.
    userId: text('user_id').references(() => users.id),
    role: text('role', { enum: ['owner', 'admin', 'instructor', 'student'] }).notNull(),
    email: text('email').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    // better-auth's member record id. Staff only — students are not members of
    // the auth-side organization, so theirs stays NULL.
    externalId: text('external_id').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    emailUq: unique().on(t.orgId, t.email),
    userUq: unique().on(t.orgId, t.userId),
  }),
);

export const invitations = pgTable(
  'invitations',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('invitation')),
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
    // One pending invitation per (org, email) — the upsert's conflict target.
    pendingEmailUq: uniqueIndex('invitations_pending_email_uq')
      .on(t.orgId, t.email)
      .where(sql`${t.status} = 'pending'`),
  }),
);

