import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { LearnBranding } from '../../schemas/index.js';
import type { Container } from '../../../app/container.js';

// Registered OUTSIDE the session-guarded learn block (see routes.ts): login
// and the invite landing render before any session exists, and the brand they
// show is deployment config, not a per-person fact — the same branding every
// transactional email carries.
export async function learnBrandingRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'GET',
    url: '/api/learn/branding',
    schema: {
      operationId: 'getLearnBranding',
      tags: ['Organizations'],
      summary: "Get the deployment's student-portal branding",
      response: { 200: LearnBranding },
    },
    handler: async () => container.branding,
  });
}
