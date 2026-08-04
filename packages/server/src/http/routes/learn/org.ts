import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { LearnOrg, LearnViewer } from '../../schemas/index.js';
import type { Container } from '../../../app/container.js';
import { UnauthorizedError } from '../../plugins/auth.js';

export async function learnOrgRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'GET',
    url: '/api/learn/org',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getLearnOrg',
      tags: ['Learn'],
      summary: "Get the portal org's public identity (branding)",
      response: { 200: LearnOrg },
    },
    handler: async (req) => {
      // The session's org (from `activeOrganizationId`) — surface its display
      // identity for the portal brand.
      const org = await container.organizations.getById(req.orgId);
      if (!org) {
        throw new UnauthorizedError('session organization not found');
      }
      return { id: org.id, name: org.name, slug: org.slug };
    },
  });

  r.route({
    method: 'GET',
    url: '/api/learn/viewer',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getLearnViewer',
      tags: ['Learn'],
      summary: "Get the caller's identity within the session's org",
      response: { 200: LearnViewer },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      return { orgUserId: orgUser.id, role: orgUser.role };
    },
  });
}
