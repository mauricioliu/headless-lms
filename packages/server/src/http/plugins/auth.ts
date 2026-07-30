// Everything better-auth touches on the HTTP surface:
//   - the /api/auth/* catch-all bridged to better-auth's Web handler
//   - the RFC 8414 OAuth discovery endpoints MCP clients need at the root
//   - the `requireSession` / `requireOrgSession` decorators routes guard with
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import type { Container } from '../../app/container.js';
import { bridgeWebResponse, toWebRequest } from '../web-bridge.js';

/** The request carries no session. The central error handler maps this to 401. */
export class UnauthorizedError extends Error {
  constructor(message = 'no session on the request') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export function registerAuth(app: FastifyInstance, container: Container): void {
  const { auth, authBaseURL } = container;

  // OAuth 2.1 / MCP clients POST form-encoded bodies to the token endpoint.
  // Fastify has no built-in parser for this content-type and would 415 before
  // the handler runs. Register a raw passthrough so the string body reaches the
  // bridge, which forwards it verbatim with the original Content-Type.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => done(null, body),
  );

  // Mount better-auth: a catch-all that bridges Fastify <-> Web Request/Response.
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      await bridgeWebResponse(await auth.handler(toWebRequest(request)), reply);
    },
  });

  // OAuth 2.0 discovery endpoints required by MCP clients (RFC 8414). These must
  // live at the root — outside any /api prefix — so MCP clients can discover the
  // authorization server via standard well-known paths.
  const discovery = oauthProviderAuthServerMetadata(auth);
  const serveDiscovery = async (request: FastifyRequest, reply: FastifyReply) => {
    await bridgeWebResponse(await discovery(toWebRequest(request)), reply);
  };
  app.get('/.well-known/oauth-authorization-server', serveDiscovery);
  // The issuer is the mounted base path (`<origin>/api/auth`), and RFC 8414
  // inserts that path after the well-known segment. Clients that follow the
  // spec literally look here; the bare path above stays for the rest.
  app.get('/.well-known/oauth-authorization-server/api/auth', serveDiscovery);

  // RFC 9728. The authorization server and the protected resource are the same
  // deployment here, so this document is served directly rather than proxied.
  const protectedResource = {
    resource: new URL('/mcp', authBaseURL).toString(),
    authorization_servers: [authBaseURL],
    bearer_methods_supported: ['header'],
  };
  app.get('/.well-known/oauth-protected-resource', async (_request, reply) => {
    await reply.send(protectedResource);
  });

  // Session only, no active org required. For the routes a caller reaches
  // *before* they have an org: creating their first organization, and accepting
  // an invitation (which is what stamps the active org onto the session).
  app.decorate('requireSession', async (request: FastifyRequest) => {
    const sessionData = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!sessionData) {
      throw new UnauthorizedError();
    }
    request.authUser = sessionData.user;
    if (sessionData.session.activeOrganizationId) {
      request.orgId = sessionData.session.activeOrganizationId;
    }
  });

  // Requires a valid session with an active org set — every org-scoped route.
  app.decorate('requireOrgSession', async (request: FastifyRequest) => {
    const sessionData = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!sessionData) {
      throw new UnauthorizedError();
    }
    if (!sessionData.session.activeOrganizationId) {
      throw new UnauthorizedError('no active organization on the session');
    }
    request.authUser = sessionData.user;
    request.orgId = sessionData.session.activeOrganizationId;
  });
}
