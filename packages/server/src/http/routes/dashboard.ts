// HTTP routes for the dashboard (overview) context.
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { EnrollmentSeries, EnrollmentSeriesQuery, OverviewStats } from '../schemas/index.js';
import type { Container } from '../../app/container.js';
import { resolveScope } from '../scope.js';

export async function dashboardRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'GET',
    url: '/api/overview',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getOverview',
      tags: ['Dashboard'],
      summary: 'Back-office overview stats',
      response: { 200: OverviewStats },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.reporting.dashboard.overview(scope.orgId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/overview/enrollments',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getEnrollmentSeries',
      tags: ['Dashboard'],
      summary: 'Enrollments granted per day over a trailing window',
      querystring: EnrollmentSeriesQuery,
      response: { 200: EnrollmentSeries },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return container.reporting.dashboard.enrollments(scope.orgId, req.query.days);
    },
  });
}
