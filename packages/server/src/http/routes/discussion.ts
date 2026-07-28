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
  CommentReactionParam,
  CommentReport,
  DiscussionActivityParam,
  DiscussionCourseParam,
  DiscussionSettings,
  EditComment,
  ErrorBody,
  ModerationQueue,
  ModerationQueueQuery,
  PatchComment,
  PostComment,
  ReportComment,
  SetDiscussionSettings,
  SetCommentsState,
  CommentView,
  CommentStates,
  ActivityComments,
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
      await gate(container, scope.orgId, scope.orgUserId, req.params.activityId);
      const actor: Actor = { orgUserId: scope.orgUserId, role: 'student' };
      return discussion.listComments(scope.orgId, req.params.activityId, actor);
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
      tags: ['Learn'],
      summary: 'Revise your own comment',
      params: CommentIdParam,
      body: EditComment,
      response: { 200: CommentView, 403: ErrorBody, 404: ErrorBody },
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
      tags: ['Learn'],
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
      await gateComment(container, scope.orgId, scope.orgUserId, req.params.commentId);
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
      await gateComment(container, scope.orgId, scope.orgUserId, req.params.commentId);
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
    method: 'DELETE',
    url: '/api/discussion/comments/:commentId/reports',
    preHandler: app.requireSession,
    schema: {
      operationId: 'dismissCommentReports',
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
    url: '/api/discussion/activities/:activityId/comments',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listActivityComments',
      tags: ['Discussion'],
      summary: "Read an activity's comments as staff",
      params: DiscussionActivityParam,
      response: { 200: ActivityComments, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      await requireActivity(container, scope.orgId, req.params.activityId);
      const actor: Actor = { orgUserId: scope.orgUserId, role: scope.role };
      return discussion.listComments(scope.orgId, req.params.activityId, actor);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/discussion/activities/:activityId/comments',
    preHandler: app.requireSession,
    schema: {
      operationId: 'postComment',
      tags: ['Discussion'],
      summary: 'Post a comment or reply on an activity as staff',
      params: DiscussionActivityParam,
      body: PostComment,
      response: { 200: CommentView, 403: ErrorBody, 404: ErrorBody },
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
      operationId: 'editComment',
      tags: ['Discussion'],
      summary: 'Revise your own comment, or publish it as a moderator',
      params: CommentIdParam,
      body: PatchComment,
      response: { 200: Comment, 403: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const actor: Actor = { orgUserId: scope.orgUserId, role: scope.role };
      if (req.body.body !== undefined) {
        // edit() renders a CommentView (author, reactions, isOwn) for the
        // learner surface. publish() only ever returns the raw Comment, so
        // the two branches of this route share that shape — re-read the row
        // rather than serve the rendered one.
        await discussion.edit(scope.orgId, req.params.commentId, actor, req.body.body);
        const comment = await discussion.findCommentForGate(scope.orgId, req.params.commentId);
        if (!comment) {
          throw new NotFoundError('Comment', req.params.commentId);
        }
        return comment;
      }
      return discussion.publish(scope.orgId, req.params.commentId, actor);
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
    url: '/api/discussion/courses/:courseId/comment-states',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listCourseCommentStates',
      tags: ['Discussion'],
      summary: "Read every per-activity comments-state override in a course",
      params: DiscussionCourseParam,
      response: { 200: CommentStates },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const states = await discussion.listCommentStates(scope.orgId, req.params.courseId);
      return { states };
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/discussion/activities/:activityId/comments',
    preHandler: app.requireSession,
    schema: {
      operationId: 'setActivityCommentsState',
      tags: ['Discussion'],
      summary: "Override or clear an activity's comments state",
      params: DiscussionActivityParam,
      body: SetCommentsState,
      response: { 204: z.void(), 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await discussion.setCommentsState(scope.orgId, req.params.activityId, req.body.state);
      return reply.code(204).send();
    },
  });
}
