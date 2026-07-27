// MCP HTTP route — mounts a stateless StreamableHTTP MCP endpoint at /mcp.
//
// Each request is handled independently (stateless mode): no session affinity
// is required, which keeps the server horizontally scalable. mcpHandler
// verifies the Bearer token against the provider's JWKS on every request and
// hands the verified claims to buildPrincipal, which translates them into the
// domain McpPrincipal the tool callbacks close over. The organization the call
// acts in comes from the token's own claims — see principal.ts.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { mcpHandler } from '@better-auth/oauth-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { Container } from '../../app/container.js';
import { bridgeWebResponse, toWebRequest } from '../web-bridge.js';
import { buildPrincipal, PrincipalError } from './principal.js';
import { registerTools } from './tools.js';

export async function mcpRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const { authBaseURL } = container;
  // This endpoint is the protected resource; the token must be audienced to it.
  // MCP clients name it via the RFC 8707 `resource` parameter — a token minted
  // for some other resource is not accepted here.
  const resource = new URL('/mcp', authBaseURL).toString();
  // better-auth issues tokens under its mounted base path, not the bare origin.
  const issuer = new URL('/api/auth', authBaseURL).toString();

  // mcpHandler verifies the bearer token against the provider's JWKS and calls
  // the inner handler only when the token is valid, with its decoded claims.
  const handler = mcpHandler(
    {
      jwksUrl: `${issuer}/jwks`,
      verifyOptions: { issuer, audience: resource },
    },
    async (req, token) => {
      let principal;
      try {
        principal = await buildPrincipal(token, container);
      } catch (err) {
        if (err instanceof PrincipalError) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: err.status,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw err;
      }

      // Stateless mode: a new McpServer + transport per request so every HTTP
      // call is self-contained. Tool callbacks close over the per-request principal.
      const mcpServer = new McpServer({ name: 'headless-lms', version: '1.0.0' });
      registerTools(mcpServer, container, principal);

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });

      await mcpServer.connect(transport);
      return transport.handleRequest(req);
    },
  );

  app.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/mcp',
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const response = await handler(toWebRequest(request));
        await bridgeWebResponse(response, reply);
      } catch (err) {
        request.log.error({ err }, 'mcp unexpected error');
        await reply.status(500).send({ error: 'internal_error' });
      }
    },
  });
}
