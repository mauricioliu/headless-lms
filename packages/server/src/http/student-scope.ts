// Resolves a request's session into the org-scoped student the learn read layer
// expects. Students are org-scoped: the org rides in the session (better-auth
// `activeOrganizationId`, stamped at login and exposed as `req.orgId` by
// `requireSession`) — no per-request header. `(orgId, externalId)` resolves the
// one participation. A session that doesn't resolve to a portal student is an
// authentication failure (→ 401).
import type { FastifyRequest } from 'fastify';
import type { Container } from '../app/container.js';
import { STUDENT_ROLE, type Organization } from '../core/organizations/index.js';

export interface StudentScope {
  /** Domain `org_users.id` for the session's person in the portal org. */
  orgUserId: string;
  /** The portal org's `organizations.id` the request is scoped to. */
  orgId: string;
  /** The portal org record (for branding surfaces). */
  org: Organization;
}

/** Thrown when the session doesn't resolve to a portal student. An auth failure → 401. */
export class NoStudentError extends Error {}

export async function resolveStudentScope(
  container: Container,
  req: FastifyRequest,
): Promise<StudentScope> {
  const authUser = req.authUser;
  const authOrgId = req.orgId ?? null;
  if (!authUser || !authOrgId) {
    throw new NoStudentError('no authenticated student session');
  }
  const org = await container.organizations.getByExternalId(authOrgId);
  if (!org) {
    throw new NoStudentError('session organization not found');
  }
  const person = await container.identity.getUserByExternalId(authUser.id);
  if (!person) {
    throw new NoStudentError('no domain person for the current session');
  }
  const participation = await container.organizations.getOrgUser(org.id, person.id);
  if (!participation || participation.role !== STUDENT_ROLE) {
    throw new NoStudentError('no student participation for the current session');
  }
  return { orgUserId: participation.id, orgId: org.id, org };
}
