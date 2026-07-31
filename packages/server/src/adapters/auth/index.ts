import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink, organization, jwt } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { UserProfile } from '@headless-lms/types';

import type { Mailer } from '../../core/shared/mailer.js';
import type { Logger } from '../../core/shared/ports.js';
import type { IdentityService } from '../../core/identity/index.js';
import type { OrganizationProvisioner } from '../../core/organizations/index.js';
import { ID_PREFIXES, prefixId } from '../../core/shared/id.js';
import * as authSchema from './schema.js';
import { ac, roles } from './access.js';

// Prefixes for better-auth's own tables. This is a distinct id space from the
// mirrored domain rows (auth `user.id` → `users.external_id`, etc.), but we reuse
// the same human-readable prefixes so a `usr_`/`org_` id reads the same on both
// sides of the mirror. Unmapped models fall back to a generic `id_` prefix.
const AUTH_ID_PREFIXES: Record<string, string> = {
  user: ID_PREFIXES.user,
  session: 'ses',
  account: 'acc',
  verification: 'ver',
  organization: ID_PREFIXES.organization,
  member: 'mem',
  invitation: 'inv',
  oauthClient: 'ocl',
  oauthAccessToken: 'oat',
  oauthRefreshToken: 'ort',
  oauthConsent: 'oac',
  jwks: 'jwk',
};

export interface CreateAuthOptions {
  db: NodePgDatabase;
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  /** Sends transactional auth emails via the template catalog. */
  mailer: Mailer;
  /** Logs failures that must not abort an auth flow (e.g. a failed invite email). */
  logger: Logger;
  /** Provisions a domain student and resolves auth users to students. */
  identity: IdentityService;
  /** Mirrors the organization plugin's records into the domain. */
  organizations: OrganizationProvisioner;
  /** Login page URL shown to unauthenticated MCP OAuth clients. */
  mcpLoginPage: string;
  /** Consent page URL the MCP OAuth flow redirects to (?consent_code&client_id&scope). */
  mcpConsentPage: string;
  /** Org-selection page: shown between login and consent when the person
   *  belongs to more than one org, so the token binds to a chosen org. */
  mcpSelectOrgPage: string;
  /** Parent domain for cross-subdomain session cookies (e.g. ".example.com"); undefined → host-only cookie. */
  cookieDomain?: string;
  /** Mark session cookies Secure (set behind HTTPS / in production). */
  secureCookies?: boolean;
}

export function createAuth(opts: CreateAuthOptions): Auth {
  const logger = opts.logger;
  // Resolve a better-auth user id to its mirrored domain staff User. The User is
  // provisioned on user creation, so it exists by the time org hooks fire.
  const getUserById = async (externalId: string) => {
    const user = await opts.identity.getUserByExternalId(externalId);
    if (!user) {
      throw new Error(`no domain user for auth user ${externalId}`);
    }
    return user;
  };

  const auth = betterAuth({
    baseURL: opts.baseURL,
    secret: opts.secret,
    trustedOrigins: opts.trustedOrigins,
    session: {
      // Signed short-lived cookie cache: avoids a Postgres session lookup on
      // every request. The BFF verifies the session per request (each API call
      // + every SSR getSession), so without this each one is a DB round-trip.
      // The cache holds for maxAge; sign-out / expiry still invalidate it.
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    advanced: {
      database: {
        // Prefixed, KSUID-bodied ids for every better-auth table (usr_, org_, …).
        generateId: ({ model }) => prefixId(AUTH_ID_PREFIXES[model] ?? 'id'),
      },
      // Cross-subdomain shared session cookie for admin/api/web on one parent
      // domain (e.g. `.example.com` in prod). Left unset in local dev so the
      // host-only `localhost` cookie is used, which is already shared across
      // ports (cookies are not port-scoped).
      crossSubDomainCookies: {
        enabled: true,
        domain: opts.cookieDomain || undefined,
      },
      // Same-site cookie for the shared-parent-domain plan. Only switch to
      // `sameSite: "none"` + `secure` if admin and api are genuinely cross-site
      // (different registrable domains).
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: opts.secureCookies ?? false,
        httpOnly: true,
      },
    },
    database: drizzleAdapter(opts.db, {
      provider: 'pg',
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        await opts.mailer.send(user.email, 'passwordReset', { resetUrl: url });
      },
    },
    plugins: [
      magicLink({
        // Invite-only: magic links sign in existing accounts, never mint new ones.
        disableSignUp: true,
        sendMagicLink: async ({ email, url }) => {
          await opts.mailer.send(email, 'magicLink', { url });
        },
      }),
      organization({
        ac,
        roles,
        creatorRole: 'owner',
        organizationHooks: {
          // Invites are domain-owned (core organizations + /api/invites).
          // Block the org plugin's native invite endpoint so it cannot
          // silently create invites the domain never learns about.
          beforeCreateInvitation: async () => {
            throw new APIError('BAD_REQUEST', {
              message: 'Invites are managed by the invite system',
            });
          },
          // New org → mirror it plus the creator's owner orgUser.
          afterCreateOrganization: async ({ organization: org, member, user }) => {
            const owner = await getUserById(user.id);
            await opts.organizations.createOrg({
              externalId: org.id,
              name: org.name,
              slug: org.slug,
              ownerId: owner.id,
            });
            await opts.organizations.addOrgUser({
              orgExternalId: org.id,
              userId: owner.id,
              role: member.role,
            });
          },
          afterAddMember: async ({ member, user, organization: org }) => {
            // During org creation better-auth adds the creator and may fire this
            // hook before afterCreateOrganization has mirrored the org. In that
            // case skip — the creator's orgUser is mirrored by
            // afterCreateOrganization. For genuine later adds the org exists.
            const mirrored = await opts.organizations.getByExternalId(org.id);
            if (!mirrored) {
              return;
            }
            const user_ = await getUserById(user.id);
            await opts.organizations.addOrgUser({
              orgExternalId: org.id,
              userId: user_.id,
              role: member.role,
            });
          },
          afterRemoveMember: async ({ user, organization: org }) => {
            const removedDomainUser = await getUserById(user.id);
            await opts.organizations.removeOrgUser({
              orgExternalId: org.id,
              userId: removedDomainUser.id,
            });
          },
        },
      }),
      // Signs the JWT access tokens the OAuth provider issues.
      jwt(),
      oauthProvider({
        loginPage: opts.mcpLoginPage,
        consentPage: opts.mcpConsentPage,
        allowDynamicClientRegistration: true,
        storeClientSecret: 'hashed',
        // The issuer-path discovery document IS served — registerAuth mounts
        // /.well-known/oauth-authorization-server/api/auth (see http/plugins/auth.ts).
        silenceWarnings: { oauthAuthServerConfig: true },
        scopes: [
          'openid',
          'profile',
          'courses:read',
          'courses:write',
          'students:read',
          'progress:read',
          'entitlements:read',
          'entitlements:write',
          'assessments:read',
          'org:read',
        ],
        // A token acts in exactly one organization, chosen by the person at
        // consent and frozen onto the token as its reference id. Nothing
        // downstream infers the org from the user's memberships — a person who
        // later joins a second org does not change what an issued token can do.
        postLogin: {
          page: opts.mcpSelectOrgPage,
          // Only interrupt when the choice is genuinely ambiguous. A single
          // org is already stamped onto the session at login (see the
          // session.create hook below), so there is nothing to ask.
          shouldRedirect: async ({ session }) => {
            const person = await opts.identity.getUserByExternalId(session.userId as string);
            if (!person) {
              return false;
            }
            const orgUsers = await opts.organizations.getOrgUsersForUser(person.id);
            return orgUsers.length > 1;
          },
          // Fail closed: no active org means no org to bind, and a token that
          // named no organization would be a token with ambient authority.
          consentReferenceId: async ({ session }) => {
            const activeOrganizationId = session.activeOrganizationId as string | undefined;
            if (!activeOrganizationId) {
              throw new APIError('BAD_REQUEST', {
                error: 'invalid_request',
                error_description: 'Select an organization before authorizing access',
              });
            }
            return activeOrganizationId;
          },
        },
        // The org rides in the token as a claim so the resource server never has
        // to guess it. Role is deliberately NOT a claim: it is read per request
        // for this org, so a revoked or downgraded role takes effect at once
        // rather than lingering until the token expires.
        customAccessTokenClaims: ({ referenceId }) => ({ org: referenceId }),
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // The person may already be here: an admin who adds a student
            // creates them before they have an account, so signing up links
            // that record rather than minting a second one. Their name stays
            // as the admin entered it — a self-chosen signup name is not more
            // authoritative, and the person can edit it in the portal.
            const existing = await opts.identity.getUserByEmail(user.email);
            if (existing) {
              if (existing.externalId === null) {
                await opts.identity.linkUser(existing.id, user.id);
                await opts.organizations.markStudentLinked(existing.id, user.id);
              }
              return;
            }
            // Nobody knew them yet — mirror better-auth's user as a new
            // person, reusing its id so the two sides read alike.
            await opts.identity.createUser({
              id: user.id,
              externalId: user.id,
              email: user.email,
              displayName: user.name,
            });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            logger.debug('session.create.before', { session });
            const person = await opts.identity.getUserByExternalId(session.userId);
            if (!person) {
              return;
            }
            const orgUsers = await opts.organizations.getOrgUsersForUser(person.id);
            if (orgUsers.length !== 1) {
              return;
            }

            const org = await opts.organizations.getById(orgUsers[0]!.orgId);
            if (!org) {
              return;
            }
            return { data: { ...session, activeOrganizationId: org.externalId } };
          },
        },
      },
    },
  }) as unknown as Auth;
  return auth;
}

// Hand-declared instead of `ReturnType<typeof betterAuth>`: better-auth infers
// that return type from the literal `plugins` array above, and the mcp
// plugin's shape embeds an internal (non-exported) `MCPOptions` type that
// TypeScript's declaration emitter cannot name when this package builds its
// own .d.ts — see the mcp plugin in better-auth/plugins. This interface
// covers exactly the surface the package touches (the web handler, session
// lookup, the MCP OAuth hooks, and organization member-writes); the object
// `createAuth` returns is the real better-auth instance underneath, just
// narrowed to this shape at the boundary.
// Mirrors `AuthUser` in http/fastify.d.ts. Declared locally rather than
// imported — the boundary linter disallows adapters -> http.
type AuthUser = UserProfile & { emailVerified: boolean };

export interface Auth {
  handler: (request: Request) => Promise<Response>;
  options: BetterAuthOptions;
  api: {
    getSession: (input: { headers: Headers }) => Promise<{
      user: AuthUser;
      session: { activeOrganizationId?: string };
    } | null>;
    // Consumed structurally by the oauth provider's discovery helper
    // (oauthProviderAuthServerMetadata).
    getOAuthServerConfig: (...args: unknown[]) => unknown;
    // Organization member-writes (see org-admin.ts).
    createOrganization: (input: {
      body: Record<string, unknown>;
      headers: Headers;
    }) => Promise<{ id: string } | null>;
    setActiveOrganization: (input: {
      body: Record<string, unknown>;
      headers: Headers;
    }) => Promise<unknown>;
    updateOrganization: (input: {
      body: Record<string, unknown>;
      headers: Headers;
    }) => Promise<unknown>;
    updateMemberRole: (input: {
      body: Record<string, unknown>;
      headers: Headers;
    }) => Promise<unknown>;
    removeMember: (input: { body: Record<string, unknown>; headers: Headers }) => Promise<unknown>;
    // Resolves an auth member record from the org + auth user id (see org-admin.ts).
    listMembers: (input: {
      query: Record<string, unknown>;
      headers: Headers;
    }) => Promise<{ members: { id: string }[] } | null>;
    // Grants a orgUser on an accepted staff invitation (server-side, no session).
    addMember: (input: {
      body: { userId: string; organizationId: string; role: string };
    }) => Promise<unknown>;
  };
  /** better-auth's internal context — used by the accept route to stamp the
   *  session's active org (students are not members, so set-active can't). */
  $context: Promise<{
    internalAdapter: {
      updateSession: (token: string, data: Record<string, unknown>) => Promise<unknown>;
    };
  }>;
}
