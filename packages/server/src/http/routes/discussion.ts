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
import { resolveScope } from '../scope.js';
import { resolveStudentScope } from '../student-scope.js';

/** Resolve an activity to its course, then assert the person holds active
 *  course access. Mirrors routes/learn.ts — a 404 for content they cannot
 *  open. The entitlements context is the authority for access; a reporting
 *  read must never be used to infer it. */
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
  const allowed = await container.entitlements.hasCourseAccess(orgId, orgUserId, module.courseId);
  if (!allowed) {
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

/** Staff are not enrolled, so no entitlement check applies — but the activity
 *  must still exist in this org, or a bogus id would fall through to the
 *  service and surface as a 500 rather than a 404. */
async function requireActivity(
  container: Container,
  orgId: string,
  activityId: string,
): Promise<void> {
  const activity = await container.content.getActivity(orgId, activityId);
  if (!activity) {
    throw new NotFoundError('Activity', activityId);
  }
}

export async function discussionRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const discussion = container.discussion;

  // --- learner surface -------------------------------------------------------

  r.route({
    method: 'GET',
    url: '/api/learn/activities/:activityId/thread',
    preHandler: app.requireSession,
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
      const actor: Actor = { orgUserId: scope.orgUserId, role: 'student' };
      return discussion.listThread(scope.orgId, req.params.activityId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/learn/activities/:activityId/thread/comments',
    preHandler: app.requireSession,
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
      tags: ['Discussion'],
      summary: 'Revise your own comment',
      params: CommentIdParam,
      body: EditComment,
      response: { 200: ThreadComment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      await gateComment(container, scope.orgId, scope.orgUserId, req.params.commentId);
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
      tags: ['Discussion'],
      summary: 'Remove your own comment',
      params: CommentIdParam,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      await gateComment(container, scope.orgId, scope.orgUserId, req.params.commentId);
      const actor: Actor = { orgUserId: scope.orgUserId, role: 'student' };
      return discussion.remove(scope.orgId, req.params.commentId, actor);
    },
  });

  r.route({
    method: 'PUT',
    url: '/api/learn/comments/:commentId/reactions',
    preHandler: app.requireSession,
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
      const actor: Actor = { orgUserId: scope.orgUserId, role: 'student' };
      await discussion.react(scope.orgId, req.params.commentId, actor, req.body.emoji);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/learn/comments/:commentId/reactions',
    preHandler: app.requireSession,
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
      const actor: Actor = { orgUserId: scope.orgUserId, role: 'student' };
      await discussion.unreact(scope.orgId, req.params.commentId, actor, req.body.emoji);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/learn/comments/:commentId/reports',
    preHandler: app.requireSession,
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
      const actor: Actor = { orgUserId: scope.orgUserId, role: 'student' };
      return discussion.report(scope.orgId, req.params.commentId, actor, req.body.reason);
    },
  });

  // --- moderator surface -----------------------------------------------------

  r.route({
    method: 'GET',
    url: '/api/discussion/queue',
    preHandler: app.requireSession,
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
    preHandler: app.requireSession,
    schema: {
      operationId: 'approveComment',
      tags: ['Discussion'],
      summary: 'Publish a comment awaiting review',
      params: CommentIdParam,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, role: scope.role };
      return discussion.approve(scope.orgId, req.params.commentId, actor);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/discussion/comments/:commentId',
    preHandler: app.requireSession,
    schema: {
      operationId: 'moderateRemoveComment',
      tags: ['Discussion'],
      summary: 'Remove a comment as a moderator',
      params: CommentIdParam,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, role: scope.role };
      return discussion.remove(scope.orgId, req.params.commentId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/discussion/comments/:commentId/restore',
    preHandler: app.requireSession,
    schema: {
      operationId: 'restoreComment',
      tags: ['Discussion'],
      summary: 'Restore a removed comment',
      params: CommentIdParam,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, role: scope.role };
      return discussion.restore(scope.orgId, req.params.commentId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/discussion/comments/:commentId/resolve-reports',
    preHandler: app.requireSession,
    schema: {
      operationId: 'resolveCommentReports',
      tags: ['Discussion'],
      summary: 'Dismiss every open report on a comment',
      params: CommentIdParam,
      response: { 204: z.void(), 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, role: scope.role };
      await discussion.resolveReports(scope.orgId, req.params.commentId, actor);
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/discussion/activities/:activityId/thread',
    preHandler: app.requireSession,
    schema: {
      operationId: 'getStaffActivityThread',
      tags: ['Discussion'],
      summary: "Read an activity's comment thread as staff",
      params: DiscussionActivityParam,
      response: { 200: ThreadView, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      await requireActivity(container, scope.orgId, req.params.activityId);
      const actor: Actor = { orgUserId: scope.orgUserId, role: scope.role };
      return discussion.listThread(scope.orgId, req.params.activityId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/discussion/activities/:activityId/thread/comments',
    preHandler: app.requireSession,
    schema: {
      operationId: 'postStaffComment',
      tags: ['Discussion'],
      summary: 'Post a comment or reply on an activity as staff',
      params: DiscussionActivityParam,
      body: PostComment,
      response: { 200: ThreadComment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      await requireActivity(container, scope.orgId, req.params.activityId);
      const actor: Actor = { orgUserId: scope.orgUserId, role: scope.role };
      return discussion.post(scope.orgId, actor, {
        activityId: req.params.activityId,
        parentId: req.body.parentId,
        body: req.body.body,
      });
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/discussion/comments/:commentId',
    preHandler: app.requireSession,
    schema: {
      operationId: 'editStaffComment',
      tags: ['Discussion'],
      summary: 'Revise your own comment as staff',
      params: CommentIdParam,
      body: EditComment,
      response: { 200: ThreadComment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, role: scope.role };
      return discussion.edit(scope.orgId, req.params.commentId, actor, req.body.body);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/discussion/courses/:courseId/settings',
    preHandler: app.requireSession,
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
    preHandler: app.requireSession,
    schema: {
      operationId: 'setDiscussionSettings',
      tags: ['Discussion'],
      summary: "Update a course's discussion settings",
      params: DiscussionCourseParam,
      body: SetDiscussionSettings,
      response: { 200: DiscussionSettings, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return discussion.setSettings(scope.orgId, req.params.courseId, req.body);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/discussion/courses/:courseId/threads',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listCourseThreads',
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
    method: 'PATCH',
    url: '/api/discussion/activities/:activityId/thread',
    preHandler: app.requireSession,
    schema: {
      operationId: 'setThreadState',
      tags: ['Discussion'],
      summary: "Override or clear an activity's thread state",
      params: DiscussionActivityParam,
      body: SetThreadState,
      response: { 204: z.void(), 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await discussion.setThreadState(scope.orgId, req.params.activityId, req.body.state);
      return reply.code(204).send();
    },
  });
}
