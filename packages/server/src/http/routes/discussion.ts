// Moderator-facing discussion routes. The learner surface (everything under
// `/api/learn`) lives in routes/learn/comments.ts.
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Comment,
  CommentIdParam,
  CommentsPage,
  CommentsQuery,
  ErrorBody,
  PatchComment,
} from '@headless-lms/api-contract';
import { NotFoundError } from '../../core/shared/errors.js';
import type { Container } from '../../app/container.js';
import type { Actor } from '../../core/discussion/index.js';
import { resolveScope } from '../scope.js';

export async function discussionRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const discussion = container.discussion;

  r.route({
    method: 'GET',
    url: '/api/comments',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listComments',
      tags: ['Discussion'],
      summary: 'List comments, filtered by course, activity, author, status or reports',
      querystring: CommentsQuery,
      response: { 200: CommentsPage },
    },
    handler: async (req) => {
      return discussion.listComments(req.orgId, req.query);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/comments/:commentId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'moderateRemoveComment',
      tags: ['Discussion'],
      summary: 'Remove a comment as a moderator',
      params: CommentIdParam,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.authUser.id);
      return discussion.remove(req.orgId, req.params.commentId, orgUser!);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/comments/:commentId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'editComment',
      tags: ['Discussion'],
      summary: 'Revise your own comment, or publish it as a moderator',
      params: CommentIdParam,
      body: PatchComment,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.authUser.id);

      return discussion.publish(req.orgId, req.params.commentId, orgUser!);
    },
  });
}
