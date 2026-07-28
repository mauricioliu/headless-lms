// The one display join for a participation's profile.
//
// A person's name and email live on org_users (so a roster entry created before
// the human ever logged in still has them); their avatar lives on the auth
// engine's mirrored `user` table, reached through the identity `users` row. Both
// joins are LEFT: user_id is null until an invitation is accepted.
//
// Sanctioned by .eslintrc.cjs — "db repositories read the auth adapter's
// mirrored `user` table for display joins".
//
// No `joinOrgUserProfile` helper: Drizzle's query builder type narrows on every
// chained call, so a generic wrapper around `.leftJoin(...).leftJoin(...)`
// can't be typed without widening it to `unknown` — each repository chains the
// two joins inline instead.
import { sql } from 'drizzle-orm';
import { orgUsers } from '../schema/organizations.js';
import { user } from '../../auth/schema.js';

/** `first last`, trimmed — the single `name` every person DTO exposes. */
export const orgUserNameExpr = sql<string>`trim(${orgUsers.firstName} || ' ' || ${orgUsers.lastName})`;

/** Spread into a `.select({ ... })` to get the profile columns. */
export const orgUserProfileColumns = {
  id: orgUsers.id,
  name: orgUserNameExpr,
  email: orgUsers.email,
  image: user.image,
};
