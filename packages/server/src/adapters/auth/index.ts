import {
  betterAuth,
  type BetterAuthOptions,
  type GenericEndpointContext,
  Session,
  User,
} from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { jwt, magicLink, organization, type OrganizationOptions } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { UserProfile } from '@headless-lms/types';

import type { Logger } from '../../core/shared/ports.js';
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

export type Hooks = OrganizationOptions['organizationHooks'] & {
  beforeUserCreate: (
    user: User & Record<string, unknown>,
    context: GenericEndpointContext | null,
  ) => Promise<
    | boolean
    | void
    | {
        data: User;
      }
  >;
  beforeCreateSession?: (
    session: Session & Record<string, unknown>,
    context: GenericEndpointContext | null,
  ) => Promise<
    | boolean
    | void
    | {
        data: Session & Record<string, any>;
      }
  >;
  sendResetPassword: (
    data: { user: User; url: string; token: string },
    request?: Request,
  ) => Promise<void>;
  sendMagicLink: (
    data: {
      email: string;
      url: string;
      token: string;
      metadata?: Record<string, unknown>;
    },
    ctx?: GenericEndpointContext | undefined,
  ) => Promise<void>;
};

export interface CreateAuthOptions {
  db: NodePgDatabase;
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  /** Logs failures that must not abort an auth flow (e.g. a failed invite email). */
  logger: Logger;
  /** Handlers for what the engine reports. The adapter owns no rules. */
  hooks: Hooks;
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
  const hooks = opts.hooks;

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
      sendResetPassword: hooks.sendResetPassword,
    },
    plugins: [
      magicLink({
        disableSignUp: true,
        sendMagicLink: hooks.sendMagicLink,
      }),
      organization({
        ac,
        roles,
        creatorRole: 'owner',
        organizationHooks: hooks,
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
          shouldRedirect: () => true,
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
          before: hooks.beforeUserCreate,
        },
      },
      session: {
        create: {
          before: async (session) => {
            logger.debug('session.create.before', { session });
            const activeOrganizationId = await hooks.activeOrgForNewSession({
              userExternalId: session.userId,
            });
            if (!activeOrganizationId) {
              return;
            }
            return { data: { ...session, activeOrganizationId } };
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
    deleteOrganization: (input: {
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
