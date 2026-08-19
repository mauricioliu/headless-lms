import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../../app/container.js';
import { UnauthorizedError } from '../../plugins/auth.js';
import {
  ErrorBody,
  EvaluationAttemptFeedback,
  EvaluationAttemptStatus,
  LearnCourseIdParam,
  SubmitEvaluationAttempt,
  ValidationErrorBody,
  validationErrorBody,
} from '../../schemas/index.js';

const AttemptParam = LearnCourseIdParam.extend({
  attemptNumber: z.coerce.number().int().min(1),
});

async function resolveLearner(
  container: Container,
  req: { orgId: string; userId: string },
): Promise<{ orgUserId: string } | null> {
  const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
  return orgUser ? { orgUserId: orgUser.id } : null;
}

export async function learnEvaluationAttemptRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const learn = container.reporting.learn;

  async function requireEnrolledCourse(
    orgId: string,
    orgUserId: string,
    courseId: string,
  ): Promise<void> {
    const course = await learn.getCourse(orgId, orgUserId, courseId);
    if (!course) {
      throw new NotFoundError('Course', courseId);
    }
  }

  r.route({
    method: 'POST',
    url: '/api/learn/courses/:courseId/evaluation/attempts',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'startCourseEvaluationAttempt',
      tags: ['Evaluation'],
      summary: 'Start (or resume) the latest Evaluation attempt — requires 100% course progress',
      params: LearnCourseIdParam,
      response: {
        201: EvaluationAttemptStatus,
        403: ErrorBody,
        404: ErrorBody,
      },
    },
    handler: async (req, reply) => {
      const learner = await resolveLearner(container, req);
      if (!learner) {
        throw new UnauthorizedError();
      }
      await requireEnrolledCourse(req.orgId, learner.orgUserId, req.params.courseId);
      const attempt = await container.evaluation.startAttempt(
        req.orgId,
        req.params.courseId,
        learner.orgUserId,
      );
      return reply.status(201).send(attempt);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/learn/courses/:courseId/evaluation/attempts/:attemptNumber/submission',
    preHandler: app.requireOrgSession,
    attachValidation: true,
    schema: {
      operationId: 'submitCourseEvaluationAttempt',
      tags: ['Evaluation'],
      summary: 'Submit an open attempt; the server grades it against the correction key',
      params: AttemptParam,
      body: SubmitEvaluationAttempt,
      response: {
        200: EvaluationAttemptFeedback,
        400: ValidationErrorBody,
        403: ErrorBody,
        404: ErrorBody,
        409: ErrorBody,
      },
    },
    handler: async (req, reply) => {
      if (req.validationError) {
        return reply.status(400).send(validationErrorBody(req.validationError));
      }
      const learner = await resolveLearner(container, req);
      if (!learner) {
        throw new UnauthorizedError();
      }
      await requireEnrolledCourse(req.orgId, learner.orgUserId, req.params.courseId);
      return container.evaluation.submitAttempt(
        req.orgId,
        req.params.courseId,
        learner.orgUserId,
        req.params.attemptNumber,
        req.body,
      );
    },
  });

  r.route({
    method: 'GET',
    url: '/api/learn/courses/:courseId/evaluation/attempts/latest',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getLatestCourseEvaluationAttempt',
      tags: ['Evaluation'],
      summary: "The learner's latest Evaluation attempt with feedback per feedbackMode",
      params: LearnCourseIdParam,
      response: { 200: EvaluationAttemptFeedback, 404: ErrorBody },
    },
    handler: async (req) => {
      const learner = await resolveLearner(container, req);
      if (!learner) {
        throw new UnauthorizedError();
      }
      await requireEnrolledCourse(req.orgId, learner.orgUserId, req.params.courseId);
      const latest = await container.evaluation.latestAttempt(
        req.orgId,
        req.params.courseId,
        learner.orgUserId,
      );
      if (!latest) {
        throw new NotFoundError('Attempt', 'latest');
      }
      return latest;
    },
  });
}
