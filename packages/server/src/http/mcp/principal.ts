// Translates a verified OAuth access token into the McpPrincipal used by the
// authz layer. Performs minimal I/O: one identity lookup + one orgUser lookup,
// both scoped to the organization the token was issued for.
import type { Container } from '../../app/container.js';
import { parseRole } from '../../core/organizations/index.js';
import type { McpPrincipal } from './authz.js';

/** The verified claims of an access token, as far as this layer reads them:
 *  `sub` is the auth user, `org` the organization consented to at issuance,
 *  `scope` the space-separated grant. Everything else is ignored here. */
export interface AccessTokenClaims {
  [claim: string]: unknown;
  sub?: unknown;
  org?: unknown;
  scope?: unknown;
}

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
 * Resolves a verified access token into a domain McpPrincipal.
 *
 * Throws PrincipalError (401) when no domain person maps to the auth user, and
 * PrincipalError (403) when the token names no organization or the person does
 * not belong to the one it names.
 */
export async function buildPrincipal(
  token: AccessTokenClaims,
  container: Container,
): Promise<McpPrincipal> {
  const subject = typeof token.sub === 'string' ? token.sub : undefined;
  if (!subject) {
    throw new PrincipalError('token identifies no user', 401);
  }

  const user = await container.identity.getUserByExternalId(subject);
  if (!user) {
    throw new PrincipalError('no domain user for auth user', 401);
  }

  // The organization is carried BY the token — the reference the person picked
  // at consent, frozen onto the credential. Nothing here infers it from the
  // person's memberships, so joining or leaving an org later cannot change what
  // an already-issued token is allowed to do.
  const orgExternalId = typeof token.org === 'string' ? token.org : undefined;
  if (!orgExternalId) {
    throw new PrincipalError('token is not bound to an organization', 403);
  }

  const org = await container.organizations.getByExternalId(orgExternalId);
  if (!org) {
    throw new PrincipalError('token names an unknown organization', 403);
  }

  // Role is read now, for this org — deliberately not taken from the token, so a
  // revoked or downgraded role applies on the next call rather than lingering
  // for the rest of the token's lifetime.
  const orgUser = await container.organizations.getOrgUser(org.id, user.id);
  if (!orgUser) {
    throw new PrincipalError('user does not belong to this organization', 403);
  }

  // JWT `scope` is a space-separated string per OAuth 2.0 convention.
  const scopes = typeof token.scope === 'string' ? token.scope.split(' ').filter(Boolean) : [];

  return {
    // The org user acted as — the tool layer's self-scope default.
    orgUserId: orgUser.id,
    orgId: org.id,
    role: parseRole(orgUser.role),
    scopes,
  };
}
