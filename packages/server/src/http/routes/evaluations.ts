import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { resolveScope } from '../scope.js';
import {
  CourseIdParam,
  ErrorBody,
  EvaluationView,
  ReplaceEvaluation,
  ValidationErrorBody,
} from '../schemas/index.js';

function validationErrorBody(error: Error) {
  const validation = (
    error as Error & {
      validation?: Array<{
        instancePath?: string;
        message?: string;
        params?: { issue?: { path?: PropertyKey[]; message?: string } };
      }>;
    }
  ).validation;
  return {
    error: 'validation_error',
    message: error.message,
    issues: (validation ?? []).map((item) => {
      const issue = item.params?.issue;
      return {
        path:
          issue?.path?.map(String).join('.') ??
          item.instancePath?.replace(/^\//, '').replaceAll('/', '.') ??
          '',
        message: issue?.message ?? item.message ?? 'Invalid value',
      };
    }),
  };
}

export async function evaluationsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'GET',
    url: '/api/courses/:id/evaluation',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getCourseEvaluation',
      tags: ['Evaluation'],
      summary: 'Get a Course Evaluation without its correction key',
      params: CourseIdParam,
      response: { 200: EvaluationView, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const evaluation = await container.evaluation.get(scope.orgId, req.params.id);
      if (!evaluation) {
        throw new NotFoundError('Evaluation', req.params.id);
      }
      return evaluation;
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/courses/:id/evaluation',
    preHandler: app.requireOrgSession,
    attachValidation: true,
    schema: {
      operationId: 'replaceCourseEvaluation',
      tags: ['Evaluation'],
      summary: 'Create or completely replace a Course Evaluation',
      params: CourseIdParam,
      body: ReplaceEvaluation,
      response: { 200: EvaluationView, 400: ValidationErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      if (req.validationError) {
        return reply.status(400).send(validationErrorBody(req.validationError));
      }
      const scope = await resolveScope(container, req);
      return container.evaluation.replace(scope.orgId, req.params.id, req.body);
    },
  });
}
