// Translates a better-auth OAuthAccessToken into the McpPrincipal used by the
// authz layer. Performs minimal I/O: one identity lookup + one orgUser lookup.
import type { OAuthAccessToken } from 'better-auth/plugins';
import type { Container } from '../../app/container.js';
import { parseRole } from '../../core/organizations/index.js';
import type { McpPrincipal } from './authz.js';

export class PrincipalError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = 'PrincipalError';
  }
}

/**
 * Resolves a verified OAuth access token into a domain McpPrincipal.
 *
 * Throws PrincipalError (401) when no domain student maps to the auth user,
 * and PrincipalError (403) when the student has no org orgUser.
 */
export async function buildPrincipal(
  token: OAuthAccessToken,
  container: Container,
): Promise<McpPrincipal> {
  const user = await container.identity.getUserByExternalId(token.userId);
  if (!user) {
    throw new PrincipalError('no domain user for auth user', 401);
  }

  // An OAuth bearer token carries no organization, so this interface picks its
  // own rule: act only when the person participates in exactly one org, and
  // refuse otherwise rather than guess. Binding the org into the token at
  // consent time would remove the ambiguity instead of refusing it.
  const orgUsers = await container.organizations.getOrgUsersForUser(user.id);
  const orgUser = orgUsers.length === 1 ? orgUsers[0] : undefined;
  if (!orgUser) {
    throw new PrincipalError(
      orgUsers.length === 0
        ? 'user participates in no organization'
        : 'token does not identify which organization to act in',
      403,
    );
  }

  const assignedCourseIds = await container.organizations.assignedCourseIds(
    orgUser.orgId,
    orgUser.id,
  );

  // OAuthAccessToken.scopes is a space-separated string per OAuth 2.0 convention.
  const scopes = token.scopes.split(' ').filter(Boolean);

  return {
    // The participation acted as — the tool layer's self-scope default.
    orgUserId: orgUser.id,
    orgId: orgUser.orgId,
    role: parseRole(orgUser.role),
    assignedCourseIds,
    scopes,
  };
}
