import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { LearnOrg } from '@headless-lms/api-contract';
import type { Container } from '../../../app/container.js';
import { resolveStudentScope } from '../../student-scope.js';

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
      // The session's student + org (from `activeOrganizationId`) — surface the
      // org's display identity for the portal brand.
      const { org } = await resolveStudentScope(container, req);
      return { id: org.id, name: org.name, slug: org.slug };
    },
  });
}
