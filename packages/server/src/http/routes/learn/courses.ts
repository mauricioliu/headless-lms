import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Course,
  ErrorBody,
  LearnCourseIdParam,
  LearnCourses,
  LearnModules,
} from '../../schemas/index.js';
import { NotFoundError } from '../../../core/shared/errors.js';
import type { Container } from '../../../app/container.js';
import { UnauthorizedError } from '../../plugins/auth.js';

export async function learnCoursesRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const learn = container.reporting.learn;

  r.route({
    method: 'GET',
    url: '/api/learn/courses',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listLearnCourses',
      tags: ['Learn'],
      summary: "List the student's enrolled courses",
      response: { 200: LearnCourses },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      return learn.listCourses(req.orgId, orgUser.id);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/learn/courses/:courseId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getLearnCourse',
      tags: ['Learn'],
      summary: 'Get one enrolled course',
      params: LearnCourseIdParam,
      response: { 200: Course, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      const course = await learn.getCourse(req.orgId, orgUser.id, req.params.courseId);
      if (!course) {
        throw new NotFoundError('Course', req.params.courseId);
      }
      return course;
    },
  });

  r.route({
    method: 'GET',
    url: '/api/learn/courses/:courseId/modules',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listLearnModules',
      tags: ['Learn'],
      summary: "List an enrolled course's module/activity tree",
      params: LearnCourseIdParam,
      response: { 200: LearnModules, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      const modules = await learn.listModules(req.orgId, orgUser.id, req.params.courseId);
      if (!modules) {
        throw new NotFoundError('Course', req.params.courseId);
      }
      return modules;
    },
  });
}
