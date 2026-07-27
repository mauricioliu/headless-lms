// HTTP routes for discussion. Two audiences on one domain service:
//   - learner routes resolve a student scope and gate on enrollment
//   - moderator routes resolve a staff scope; the domain enforces the rest
// The `Actor` handed to the service carries staff standing resolved here from
// the session's active-org role — core never looks a role up to authorise.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Comment,
  CommentIdParam,
  CommentReport,
  DiscussionActivityParam,
  DiscussionCourseParam,
  DiscussionSettings,
  EditComment,
  ErrorBody,
  ModerationQueue,
  ModerationQueueQuery,
  PostComment,
  ReactToComment,
  ReportComment,
  SetDiscussionSettings,
  SetThreadState,
  ThreadComment,
  ThreadStates,
  ThreadView,
} from '@headless-lms/api-contract';
import { NotFoundError } from '../../core/shared/errors.js';
import type { Container } from '../../app/container.js';
import type { Actor } from '../../core/discussion/index.js';
import type { Role } from '../../core/organizations/index.js';
import { resolveScope } from '../scope.js';
import { resolveStudentScope } from '../student-scope.js';

/** Resolve an activity to its course, then assert the person is enrolled.
 *  Mirrors routes/learn.ts — a 404 for content they cannot open. */
async function gate(
  container: Container,
  orgId: string,
  orgUserId: string,
  activityId: string,
): Promise<void> {
  const activity = await container.content.getActivity(orgId, activityId);
  const module = activity && (await container.content.getModule(orgId, activity.moduleId));
  if (!module) {
    throw new NotFoundError('Activity', activityId);
  }
  const course = await container.reporting.learn.getCourse(orgId, orgUserId, module.courseId);
  if (!course) {
    throw new NotFoundError('Activity', activityId);
  }
}

/** The comment must belong to an activity this learner may open. */
async function gateComment(
  container: Container,
  orgId: string,
  orgUserId: string,
  commentId: string,
): Promise<void> {
  const comment = await container.discussion.findCommentForGate(orgId, commentId);
  if (!comment) {
    throw new NotFoundError('Comment', commentId);
  }
  await gate(container, orgId, orgUserId, comment.activityId);
}

export async function discussionRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const discussion = container.discussion;

  // --- learner surface -------------------------------------------------------

  r.route({
    method: 'GET',
    url: '/api/learn/activities/:activityId/thread',
    schema: {
      operationId: 'getActivityThread',
      tags: ['Discussion'],
      summary: "Read an activity's comment thread",
      params: DiscussionActivityParam,
      response: { 200: ThreadView, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      await gate(container, scope.orgId, scope.orgUserId, req.params.activityId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
      return discussion.listThread(scope.orgId, req.params.activityId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/learn/activities/:activityId/comments',
    schema: {
      operationId: 'postComment',
      tags: ['Discussion'],
      summary: 'Post a comment or reply on an activity',
      params: DiscussionActivityParam,
      body: PostComment,
      response: { 200: ThreadComment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      await gate(container, scope.orgId, scope.orgUserId, req.params.activityId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
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
    schema: {
      operationId: 'editComment',
      tags: ['Discussion'],
      summary: 'Revise your own comment',
      params: CommentIdParam,
      body: EditComment,
      response: { 200: ThreadComment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      await gateComment(container, scope.orgId, scope.orgUserId, req.params.commentId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
      return discussion.edit(scope.orgId, req.params.commentId, actor, req.body.body);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/learn/comments/:commentId',
    schema: {
      operationId: 'removeOwnComment',
      tags: ['Discussion'],
      summary: 'Remove your own comment',
      params: CommentIdParam,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      await gateComment(container, scope.orgId, scope.orgUserId, req.params.commentId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
      return discussion.remove(scope.orgId, req.params.commentId, actor);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/learn/comments/:commentId/reactions',
    schema: {
      operationId: 'reactToComment',
      tags: ['Discussion'],
      summary: 'Add a reaction to a comment',
      params: CommentIdParam,
      body: ReactToComment,
      response: { 204: z.void(), 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveStudentScope(container, req);
      await gateComment(container, scope.orgId, scope.orgUserId, req.params.commentId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
      await discussion.react(scope.orgId, req.params.commentId, actor, req.body.emoji);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/learn/comments/:commentId/reactions',
    schema: {
      operationId: 'unreactToComment',
      tags: ['Discussion'],
      summary: 'Remove your reaction from a comment',
      params: CommentIdParam,
      body: ReactToComment,
      response: { 204: z.void(), 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveStudentScope(container, req);
      await gateComment(container, scope.orgId, scope.orgUserId, req.params.commentId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
      await discussion.unreact(scope.orgId, req.params.commentId, actor, req.body.emoji);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/learn/comments/:commentId/reports',
    schema: {
      operationId: 'reportComment',
      tags: ['Discussion'],
      summary: 'Flag a comment for moderator attention',
      params: CommentIdParam,
      body: ReportComment,
      response: { 200: CommentReport, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      await gateComment(container, scope.orgId, scope.orgUserId, req.params.commentId);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: false };
      return discussion.report(scope.orgId, req.params.commentId, actor, req.body.reason);
    },
  });

  // --- moderator surface -----------------------------------------------------

  r.route({
    method: 'GET',
    url: '/api/discussion/queue',
    schema: {
      operationId: 'getModerationQueue',
      tags: ['Discussion'],
      summary: 'List comments awaiting review or carrying unresolved reports',
      querystring: ModerationQueueQuery,
      response: { 200: ModerationQueue },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const entries = await discussion.queue(scope.orgId, {
        kind: req.query.kind,
        courseId: req.query.courseId,
      });
      return { entries };
    },
  });

  r.route({
    method: 'POST',
    url: '/api/discussion/comments/:commentId/approve',
    schema: {
      operationId: 'approveComment',
      tags: ['Discussion'],
      summary: 'Publish a comment awaiting review',
      params: CommentIdParam,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: (scope.role as Role) !== 'student' };
      return discussion.approve(scope.orgId, req.params.commentId, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/discussion/comments/:commentId',
    schema: {
      operationId: 'moderateRemoveComment',
      tags: ['Discussion'],
      summary: 'Remove a comment as a moderator',
      params: CommentIdParam,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: (scope.role as Role) !== 'student' };
      return discussion.remove(scope.orgId, req.params.commentId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/discussion/comments/:commentId/restore',
    schema: {
      operationId: 'restoreComment',
      tags: ['Discussion'],
      summary: 'Restore a removed comment',
      params: CommentIdParam,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: (scope.role as Role) !== 'student' };
      return discussion.restore(scope.orgId, req.params.commentId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/discussion/comments/:commentId/resolve-reports',
    schema: {
      operationId: 'resolveCommentReports',
      tags: ['Discussion'],
      summary: 'Dismiss every open report on a comment',
      params: CommentIdParam,
      response: { 204: z.void(), 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, isStaff: (scope.role as Role) !== 'student' };
      await discussion.resolveReports(scope.orgId, req.params.commentId, actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/discussion/courses/:courseId/settings',
    schema: {
      operationId: 'getDiscussionSettings',
      tags: ['Discussion'],
      summary: "Read a course's discussion settings",
      params: DiscussionCourseParam,
      response: { 200: DiscussionSettings },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return discussion.getSettings(scope.orgId, req.params.courseId);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/discussion/courses/:courseId/settings',
    schema: {
      operationId: 'setDiscussionSettings',
      tags: ['Discussion'],
      summary: "Update a course's discussion settings",
      params: DiscussionCourseParam,
      body: SetDiscussionSettings,
      response: { 200: DiscussionSettings },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return discussion.setSettings(scope.orgId, req.params.courseId, req.body);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/discussion/courses/:courseId/thread-states',
    schema: {
      operationId: 'getThreadStates',
      tags: ['Discussion'],
      summary: "Read every per-activity thread-state override in a course",
      params: DiscussionCourseParam,
      response: { 200: ThreadStates },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const states = await discussion.listThreadStates(scope.orgId, req.params.courseId);
      return { states };
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/discussion/activities/:activityId/thread-state',
    schema: {
      operationId: 'setActivityThreadState',
      tags: ['Discussion'],
      summary: "Override or clear an activity's thread state",
      params: DiscussionActivityParam,
      body: SetThreadState,
      response: { 204: z.void() },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await discussion.setThreadState(scope.orgId, req.params.activityId, req.body.state);
      return reply.code(204).send();
    },
  });
}
