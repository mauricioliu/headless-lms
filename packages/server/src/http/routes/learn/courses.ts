import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ActivityList,
  Course,
  ErrorBody,
  EvaluationView,
  LearnCourseIdParam,
  LearnCourses,
  LearnModules,
} from '../../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
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
      tags: ['Content'],
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
      tags: ['Content'],
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
    url: '/api/learn/courses/:courseId/evaluation',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getLearnCourseEvaluation',
      tags: ['Evaluation'],
      summary: "Get an enrolled published Course's Evaluation",
      params: LearnCourseIdParam,
      response: { 200: EvaluationView, 404: ErrorBody },
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
      const evaluation = await container.evaluation.get(req.orgId, req.params.courseId);
      if (!evaluation) {
        throw new NotFoundError('Evaluation', req.params.courseId);
      }
      return evaluation;
    },
  });

  r.route({
    method: 'GET',
    url: '/api/learn/courses/:courseId/modules',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listLearnModules',
      tags: ['Content'],
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

  r.route({
    method: 'GET',
    url: '/api/learn/courses/:courseId/activities',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listLearnActivities',
      tags: ['Content'],
      summary: "List an enrolled course's published activities",
      params: LearnCourseIdParam,
      response: { 200: ActivityList, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      const activities = await learn.listActivities(req.orgId, orgUser.id, req.params.courseId);
      if (!activities) {
        throw new NotFoundError('Course', req.params.courseId);
      }
      return activities;
    },
  });
}
