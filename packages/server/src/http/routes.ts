import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { coursesRoutes } from './routes/courses.js';
import { downloadsRoutes } from './routes/downloads.js';
import { bundlesRoutes } from './routes/bundles.js';
import { learnRoutes } from './routes/learn/index.js';
import { discussionRoutes } from './routes/discussion.js';
import { activitiesRoutes } from './routes/activities.js';
import { studentsRoutes } from './routes/students.js';
import { entitlementsRoutes } from './routes/entitlements.js';
import { automationsRoutes } from './routes/automations.js';
import { organizationsRoutes } from './routes/organizations.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { courseAnalyticsRoutes } from './routes/course-analytics.js';
import { assetsRoutes } from './routes/assets.js';
import { integrationsRoutes } from './routes/integrations.js';

export function registerRoutes(
  app: FastifyInstance,
  container: Container,
): void {
  app.get('/health', async () => ({ status: 'ok' }));

  app.register(async (instance) => {
    // instance.addHook('onRequest', instance.requireSession);
    await organizationsRoutes(instance, container);
  });

  app.register(async (instance) => {
    instance.addHook('onRequest', instance.requireOrgSession);
    await coursesRoutes(instance, container);
    await downloadsRoutes(instance, container);
    await bundlesRoutes(instance, container);
    await learnRoutes(instance, container);
    await discussionRoutes(instance, container);
    await activitiesRoutes(instance, container);
    await studentsRoutes(instance, container);
    await entitlementsRoutes(instance, container);
    // Automations stay read-only in v1 (ticket #18): reads are mounted, the
    // create/update/delete registrar (`automationsMutationRoutes`) is not —
    // nothing in the pilot goes through the automation engine, so no route
    // reachable from the Client Admin surface can activate an automation.
    await automationsRoutes(instance, container);
    await dashboardRoutes(instance, container);
    await courseAnalyticsRoutes(instance, container);
    await assetsRoutes(instance, container);
    await integrationsRoutes(instance, container);
  });
}
