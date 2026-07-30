// Resolves a request's session into the domain ids the org-scoped back-office
// services expect. `req.orgId` is the better-auth active-organization id and
// `req.authUser` the better-auth user — both set by the `requireOrgSession`
// preHandler. Back-office routes run `requireOrgSession` then `resolveScope`.
//
// Session + active org alone are not staff-only: every better-auth user
// (including portal students) gets a mirrored domain `users` row, and a
// student session carries their org as `activeOrganizationId` too. Students
// now hold an `org_users` row like everyone else, so the participation
// existing is no longer proof of staff — its role is what gates the
// back-office API.
//
// The active org selects which participation applies, which is what makes an
// org switcher work: one person can be owner in one org and instructor in
// another, and the session says which they are acting as.
import type { FastifyRequest } from 'fastify';
import type { Container } from '../app/container.js';
import { isStaffRole, type StaffRole } from '../core/organizations/index.js';

export interface OrgScope {
  /** Domain `organizations.id` for the session's active org. */
  orgId: string;
  /** Domain `users.id` of the acting person. */
  userId: string;
  /** Domain `org_users.id` — the acting participation in this org. */
  orgUserId: string;
  /** The role held in this org. */
  role: StaffRole;
  /** Better-auth organization id (for writes that go through the auth provider). */
  authOrgId: string;
}

/** Thrown when the session has no resolvable active org / domain user. */
export class NoActiveOrgError extends Error {}

export async function resolveScope(container: Container, req: FastifyRequest): Promise<OrgScope> {
  const authUser = req.authUser;
  const authOrgId = req.orgId ?? null;
  if (!authUser) {
    throw new NoActiveOrgError('no authenticated user');
  }
  if (!authOrgId) {
    throw new NoActiveOrgError('no active organization in session');
  }
  const org = await container.organizations.getByExternalId(authOrgId);
  if (!org) {
    throw new NoActiveOrgError('active organization not found');
  }
  const user = await container.identity.getUserByExternalId(authUser.id);
  if (!user) {
    throw new NoActiveOrgError('no domain user for the current user');
  }
  const orgUser = await container.organizations.getOrgUser(org.id, user.id);
  if (!orgUser || !isStaffRole(orgUser.role)) {
    throw new NoActiveOrgError('not a staff member of the active organization');
  }
  container.requestContext.set({ orgId: org.id });
  return {
    orgId: org.id,
    userId: user.id,
    orgUserId: orgUser.id,
    role: orgUser.role,
    authOrgId,
  };
}
