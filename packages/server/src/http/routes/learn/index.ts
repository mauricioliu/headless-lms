// HTTP routes for the student-facing Learn surface. Session-guarded like every
// back-office route, but scoped by the student's enrollments via
// `resolveStudentScope` — never by org. One file per resource; everything under
// `/api/learn` lives in this directory and nowhere else.
import type { FastifyInstance } from 'fastify';
import type { Container } from '../../../app/container.js';
import { learnAssetsRoutes } from './assets.js';
import { learnCommentsRoutes } from './comments.js';
import { learnCoursesRoutes } from './courses.js';
import { learnDownloadsRoutes } from './downloads.js';
import { learnOrgRoutes } from './org.js';
import { learnProgressRoutes } from './progress.js';

export async function learnRoutes(app: FastifyInstance, container: Container): Promise<void> {
  await learnOrgRoutes(app, container);
  await learnCoursesRoutes(app, container);
  await learnProgressRoutes(app, container);
  await learnCommentsRoutes(app, container);
  await learnAssetsRoutes(app, container);
  await learnDownloadsRoutes(app, container);
}
