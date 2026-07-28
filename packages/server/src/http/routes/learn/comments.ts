// The learner side of discussion: comments, reactions and reports on an
// activity. The moderator side lives in routes/discussion.ts.
// The actor is always a student here; discussion decides what that reaches,
// including the course-access check behind every 404.
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ActivityComments,
  Comment,
  CommentIdParam,
  CommentReactionParam,
  CommentReport,
  CommentView,
  DiscussionActivityParam,
  EditComment,
  ErrorBody,
  PostComment,
  ReportComment,
} from '@headless-lms/api-contract';
import type { Container } from '../../../app/container.js';
import type { Actor } from '../../../core/discussion/index.js';
import { resolveStudentScope } from '../../student-scope.js';

export async function learnCommentsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const discussion = container.discussion;

  r.route({
    method: 'GET',
    url: '/api/learn/activities/:activityId/comments',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listActivityComments',
      tags: ['Learn'],
      summary: "Read an activity's comments",
      params: DiscussionActivityParam,
      response: { 200: ActivityComments, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, role: 'student' };
      return discussion.activityComments(scope.orgId, req.params.activityId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/learn/activities/:activityId/comments',
    preHandler: app.requireSession,
    schema: {
      operationId: 'postComment',
      tags: ['Learn'],
      summary: 'Post a comment or reply on an activity',
      params: DiscussionActivityParam,
      body: PostComment,
      response: { 200: CommentView, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, role: 'student' };
      return discussion.post(scope.orgId, actor, {
        activityId: req.params.activityId,
        parentId: req.body.parentId,
        body: req.body.body,
      });
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/learn/comments/:commentId',
    preHandler: app.requireSession,
    schema: {
      operationId: 'editComment',
      tags: ['Learn'],
      summary: 'Revise your own comment',
      params: CommentIdParam,
      body: EditComment,
      response: { 200: CommentView, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, role: 'student' };
      return discussion.edit(scope.orgId, req.params.commentId, actor, req.body.body);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/learn/comments/:commentId',
    preHandler: app.requireSession,
    schema: {
      operationId: 'removeOwnComment',
      tags: ['Learn'],
      summary: 'Remove your own comment',
      params: CommentIdParam,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, role: 'student' };
      return discussion.remove(scope.orgId, req.params.commentId, actor);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/learn/comments/:commentId/reactions/:emoji',
    preHandler: app.requireSession,
    schema: {
      operationId: 'reactToComment',
      tags: ['Learn'],
      summary: 'Add a reaction to a comment',
      params: CommentReactionParam,
      response: { 204: z.void(), 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveStudentScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, role: 'student' };
      await discussion.react(scope.orgId, req.params.commentId, actor, req.params.emoji);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/learn/comments/:commentId/reactions/:emoji',
    preHandler: app.requireSession,
    schema: {
      operationId: 'unreactToComment',
      tags: ['Learn'],
      summary: 'Remove your reaction from a comment',
      params: CommentReactionParam,
      response: { 204: z.void(), 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveStudentScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, role: 'student' };
      await discussion.unreact(scope.orgId, req.params.commentId, actor, req.params.emoji);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/learn/comments/:commentId/reports',
    preHandler: app.requireSession,
    schema: {
      operationId: 'reportComment',
      tags: ['Learn'],
      summary: 'Flag a comment for moderator attention',
      params: CommentIdParam,
      body: ReportComment,
      response: { 200: CommentReport, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, role: 'student' };
      return discussion.reportComment(scope.orgId, req.params.commentId, actor, req.body.reason);
    },
  });
}
