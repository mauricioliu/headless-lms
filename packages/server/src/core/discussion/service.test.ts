import { describe, it, expect } from 'vitest';
import { DiscussionServiceImpl, DEFAULT_SETTINGS } from './service.js';
import type {
  AuthorRecord,
  CommentWithContext,
  DiscussionRepository,
  DiscussionUnitOfWork,
} from './ports.js';
import type {
  Comment,
  CommentReaction,
  CommentReport,
  DiscussionSettings,
  ThreadState,
} from './model.js';
import type { NewDiscussionEvent } from './events.js';
import { NotFoundError, ForbiddenError } from '../shared/errors.js';
import type { Actor } from './ports.js';

/** Every activity in these tests belongs to course c1 unless a test says
 *  otherwise — the service resolves the course rather than being handed it. */
export function fakeRepo() {
  const comments: Comment[] = [];
  const reactions: CommentReaction[] = [];
  const reports: CommentReport[] = [];
  const settings = new Map<string, DiscussionSettings>();
  const threadStates = new Map<string, ThreadState>();
  const authors = new Map<string, AuthorRecord>();
  const activityCourse = new Map<string, string>([
    ['a1', 'c1'],
    ['a2', 'c1'],
  ]);
  const existingCourses = new Set<string>(['c1', 'c2']);
  const activityTitle = new Map<string, string>([
    ['a1', 'Lesson one'],
    ['a2', 'Lesson two'],
  ]);

  function author(id: string): AuthorRecord {
    return (
      authors.get(id) ?? {
        id,
        name: id,
        image: null,
        role: 'student',
        email: `${id}@example.test`,
      }
    );
  }

  function withContext(list: Comment[], courseId?: string): CommentWithContext[] {
    return list
      .map((comment) => ({
        comment,
        courseId: activityCourse.get(comment.activityId) ?? '',
        activityTitle: activityTitle.get(comment.activityId) ?? '',
      }))
      .filter((e) => courseId === undefined || e.courseId === courseId);
  }

  const repo: DiscussionRepository = {
    async insertComment(_orgId, comment) {
      comments.push({ ...comment });
      return comment;
    },
    async findComment(orgId, id) {
      return comments.find((c) => c.orgId === orgId && c.id === id) ?? null;
    },
    async updateComment(orgId, id, patch) {
      const c = comments.find((x) => x.orgId === orgId && x.id === id);
      if (!c) {
        return null;
      }
      Object.assign(c, patch);
      return { ...c };
    },
    async listByActivity(orgId, activityId) {
      return comments
        .filter((c) => c.orgId === orgId && c.activityId === activityId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((c) => ({ ...c }));
    },
    async listReactions(orgId, commentIds) {
      return reactions.filter((r) => r.orgId === orgId && commentIds.includes(r.commentId));
    },
    async insertReaction(_orgId, reaction) {
      const dup = reactions.some(
        (r) =>
          r.orgId === reaction.orgId &&
          r.commentId === reaction.commentId &&
          r.orgUserId === reaction.orgUserId &&
          r.emoji === reaction.emoji,
      );
      if (!dup) {
        reactions.push({ ...reaction });
      }
    },
    async deleteReaction(orgId, commentId, orgUserId, emoji) {
      const i = reactions.findIndex(
        (r) =>
          r.orgId === orgId &&
          r.commentId === commentId &&
          r.orgUserId === orgUserId &&
          r.emoji === emoji,
      );
      if (i >= 0) {
        reactions.splice(i, 1);
      }
    },
    async insertReport(_orgId, report) {
      const dup = reports.some(
        (r) =>
          r.orgId === report.orgId &&
          r.commentId === report.commentId &&
          r.orgUserId === report.orgUserId,
      );
      if (dup) {
        return null;
      }
      reports.push({ ...report });
      return report;
    },
    async listOpenReports(orgId, commentIds) {
      return reports
        .filter((r) => r.orgId === orgId && !r.resolvedAt && commentIds.includes(r.commentId))
        .map((r) => ({ ...r }));
    },
    async resolveReportsFor(orgId, commentId, resolvedAt) {
      for (const r of reports) {
        if (r.orgId === orgId && r.commentId === commentId && !r.resolvedAt) {
          r.resolvedAt = resolvedAt;
        }
      }
    },
    async courseExists(_orgId, courseId) {
      return existingCourses.has(courseId);
    },
    async findSettings(orgId, courseId) {
      return settings.get(`${orgId}:${courseId}`) ?? null;
    },
    async upsertSettings(orgId, next) {
      settings.set(`${orgId}:${next.courseId}`, { ...next });
      return { ...next };
    },
    async findThreadState(orgId, activityId) {
      return threadStates.get(`${orgId}:${activityId}`) ?? null;
    },
    async listThreadStatesByCourse(orgId, courseId) {
      const out: Record<string, ThreadState> = {};
      for (const [key, state] of threadStates) {
        const [keyOrg, activityId] = key.split(':');
        if (keyOrg === orgId && activityCourse.get(activityId!) === courseId) {
          out[activityId!] = state;
        }
      }
      return out;
    },
    async upsertThreadState(orgId, activityId, state) {
      threadStates.set(`${orgId}:${activityId}`, state);
    },
    async clearThreadState(orgId, activityId) {
      threadStates.delete(`${orgId}:${activityId}`);
    },
    async courseOfActivity(_orgId, activityId) {
      return activityCourse.get(activityId) ?? null;
    },
    async listByStatusWithContext(orgId, status, courseId) {
      return withContext(
        comments.filter((c) => c.orgId === orgId && c.status === status),
        courseId,
      );
    },
    async listReportedWithContext(orgId, courseId) {
      const open = new Set(reports.filter((r) => !r.resolvedAt).map((r) => r.commentId));
      return withContext(
        comments.filter((c) => c.orgId === orgId && open.has(c.id)),
        courseId,
      );
    },
    async authorsOf(_orgId, orgUserIds) {
      const out: Record<string, AuthorRecord> = {};
      for (const id of orgUserIds) {
        out[id] = author(id);
      }
      return out;
    },
  };
  return { repo, comments, reactions, reports, settings, threadStates, authors, activityCourse };
}

export function fakeUow(repo: DiscussionRepository) {
  const appended: NewDiscussionEvent[] = [];
  const uow: DiscussionUnitOfWork = {
    run: (fn) =>
      fn({
        discussion: repo,
        outbox: {
          append: async (events) => {
            appended.push(...(events as unknown as NewDiscussionEvent[]));
          },
        },
      }),
  };
  return { uow, appended };
}

export function makeService(fake = fakeRepo()) {
  const { uow, appended } = fakeUow(fake.repo);
  const service = new DiscussionServiceImpl(fake.repo, uow, () => '2026-07-27T00:00:00.000Z');
  return { service, appended, ...fake };
}

describe('settings', () => {
  it('returns the defaults for a course with no stored settings', async () => {
    const { service } = makeService();
    const settings = await service.getSettings('o1', 'c1');
    expect(settings).toEqual({ orgId: 'o1', courseId: 'c1', ...DEFAULT_SETTINGS });
  });

  it('merges a patch over the defaults and persists the whole row', async () => {
    const { service } = makeService();
    const saved = await service.setSettings('o1', 'c1', { enabled: true, requireReview: true });
    expect(saved).toEqual({
      orgId: 'o1',
      courseId: 'c1',
      enabled: true,
      threaded: true,
      requireReview: true,
      reactions: true,
    });
    expect(await service.getSettings('o1', 'c1')).toEqual(saved);
  });

  it('resolves the course from the activity, not from a caller argument', async () => {
    const { service } = makeService();
    await service.setSettings('o1', 'c1', { enabled: true });
    const config = await service.resolveConfig('o1', 'a1');
    expect(config).toEqual({
      enabled: true,
      threaded: true,
      requireReview: false,
      reactions: true,
      state: 'visible',
    });
  });

  it('throws NotFoundError for an activity that does not exist', async () => {
    const { service } = makeService();
    await expect(service.resolveConfig('o1', 'nope')).rejects.toThrow(NotFoundError);
  });

  it("lets an activity's thread state override the course", async () => {
    const { service } = makeService();
    await service.setSettings('o1', 'c1', { enabled: true });
    await service.setThreadState('o1', 'a1', 'locked');
    expect((await service.resolveConfig('o1', 'a1')).state).toBe('locked');
  });

  it('falls back to the course setting once the override is cleared', async () => {
    const { service } = makeService();
    await service.setSettings('o1', 'c1', { enabled: true });
    await service.setThreadState('o1', 'a1', 'hidden');
    await service.setThreadState('o1', 'a1', null);
    expect((await service.resolveConfig('o1', 'a1')).state).toBe('visible');
  });

  it('resolves state to hidden when discussion is disabled for the course', async () => {
    const { service } = makeService();
    const config = await service.resolveConfig('o1', 'a1');
    expect(config.enabled).toBe(false);
    expect(config.state).toBe('hidden');
  });

  it('keeps a disabled course hidden even when the activity overrides the state', async () => {
    const { service } = makeService();
    await service.setSettings('o1', 'c1', { enabled: false });
    await service.setThreadState('o1', 'a1', 'visible');
    expect((await service.resolveConfig('o1', 'a1')).state).toBe('hidden');
  });

  it('lists only the activities in the course that carry an override', async () => {
    const { service } = makeService();
    await service.setThreadState('o1', 'a1', 'locked');
    expect(await service.listThreadStates('o1', 'c1')).toEqual({ a1: 'locked' });
  });

  it('throws NotFoundError from setSettings for a course that does not exist', async () => {
    const { service } = makeService();
    await expect(service.setSettings('o1', 'nope', { enabled: true })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws NotFoundError from setThreadState for an activity that does not exist', async () => {
    const { service } = makeService();
    await expect(service.setThreadState('o1', 'nope', 'locked')).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError from clearing a thread state for an activity that does not exist', async () => {
    const { service } = makeService();
    await expect(service.setThreadState('o1', 'nope', null)).rejects.toThrow(NotFoundError);
  });
});

const learner: Actor = { orgUserId: 'orm_learner', role: 'student' };
const staff: Actor = { orgUserId: 'orm_staff', role: 'instructor' };

async function enabled(service: DiscussionServiceImpl, patch = {}) {
  await service.setSettings('o1', 'c1', { enabled: true, ...patch });
}

describe('post', () => {
  it('publishes a learner comment when review is off', async () => {
    const { service, appended } = makeService();
    await enabled(service);
    const comment = await service.post('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'first',
    });
    expect(comment.status).toBe('published');
    expect(appended).toHaveLength(1);
    expect(appended[0]?.type).toBe('comment.created');
  });

  it('returns a resolved author and never an email', async () => {
    const fake = fakeRepo();
    fake.authors.set('orm_staff', {
      id: 'orm_staff',
      name: 'Sarah Chen',
      image: 'https://img.test/s.png',
      role: 'instructor',
      email: 'sarah@example.test',
    });
    const { service } = makeService(fake);
    await enabled(service);
    const comment = await service.post('o1', staff, {
      activityId: 'a1',
      parentId: null,
      body: 'hello',
    });
    expect(comment.author).toEqual({
      id: 'orm_staff',
      name: 'Sarah Chen',
      image: 'https://img.test/s.png',
      role: 'instructor',
    });
    expect('email' in comment.author).toBe(false);
  });

  it('holds a learner comment pending when review is on', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const comment = await service.post('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'q',
    });
    expect(comment.status).toBe('pending');
  });

  it('publishes a staff comment even when review is on', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const comment = await service.post('o1', staff, {
      activityId: 'a1',
      parentId: null,
      body: 'answer',
    });
    expect(comment.status).toBe('published');
  });

  it('refuses to post when discussion is disabled for the course', async () => {
    const { service } = makeService();
    await expect(
      service.post('o1', learner, { activityId: 'a1', parentId: null, body: 'x' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses to post to a locked thread', async () => {
    const { service } = makeService();
    await enabled(service);
    await service.setThreadState('o1', 'a1', 'locked');
    await expect(
      service.post('o1', learner, { activityId: 'a1', parentId: null, body: 'x' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reply when replies are disabled', async () => {
    const { service } = makeService();
    await enabled(service, { threaded: false });
    const root = await service.post('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    await expect(
      service.post('o1', learner, { activityId: 'a1', parentId: root.id, body: 'reply' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reply to a reply — nesting is one level', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.post('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    const reply = await service.post('o1', staff, {
      activityId: 'a1',
      parentId: root.id,
      body: 'reply',
    });
    await expect(
      service.post('o1', learner, { activityId: 'a1', parentId: reply.id, body: 'nested' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reply to a pending comment', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const pending = await service.post('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'q',
    });
    await expect(
      service.post('o1', staff, { activityId: 'a1', parentId: pending.id, body: 'reply' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reply to a comment on a different activity', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.post('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    await expect(
      service.post('o1', learner, { activityId: 'a2', parentId: root.id, body: 'reply' }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('listThread', () => {
  it('serves a pending comment to its author but not to another learner', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const pending = await service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'q',
    });

    const own = await service.listThread('o1', 'a1', learner);
    expect(own.comments.map((c) => c.id)).toContain(pending.id);

    const other: Actor = { orgUserId: 'orm_other', role: 'student' };
    const theirs = await service.listThread('o1', 'a1', other);
    expect(theirs.comments).toHaveLength(0);

    const moderator = await service.listThread('o1', 'a1', staff);
    expect(moderator.comments.map((c) => c.id)).toContain(pending.id);
  });

  it('resolves the author from their current role and omits their email', async () => {
    const fake = fakeRepo();
    fake.authors.set('orm_staff', {
      id: 'orm_staff', name: 'Sarah Chen', image: null, role: 'instructor',
      email: 'sarah@example.test',
    });
    const { service } = makeService(fake);
    await enabled(service);
    await service.post('o1', staff, { activityId: 'a1', parentId: null, body: 'hello' });
    const view = await service.listThread('o1', 'a1', learner);
    expect(view.comments[0]?.author).toEqual({
      id: 'orm_staff', name: 'Sarah Chen', image: null, role: 'instructor',
    });
  });

  it('flags a comment as the reader own only for its author', async () => {
    const { service } = makeService();
    await enabled(service);
    await service.post('o1', learner, { activityId: 'a1', parentId: null, body: 'mine' });
    expect((await service.listThread('o1', 'a1', learner)).comments[0]?.isOwn).toBe(true);
    expect((await service.listThread('o1', 'a1', staff)).comments[0]?.isOwn).toBe(false);
  });

  it('serves nothing for a hidden thread', async () => {
    const { service } = makeService();
    await enabled(service);
    await service.post('o1', learner, { activityId: 'a1', parentId: null, body: 'hi' });
    await service.setThreadState('o1', 'a1', 'hidden');
    const view = await service.listThread('o1', 'a1', learner);
    expect(view.comments).toHaveLength(0);
    expect(view.config.state).toBe('hidden');
  });

  it('serves a removed comment as a placeholder when its reply is visible', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'bad',
    });
    await service.post('o1', staff, {
      activityId: 'a1', parentId: root.id, body: 'reply',
    });
    await service.remove('o1', root.id, staff);

    const view = await service.listThread('o1', 'a1', learner);
    const placeholder = view.comments.find((c) => c.id === root.id);
    expect(placeholder?.body).toBeNull();
    expect(placeholder?.status).toBe('removed');
    expect(placeholder?.removedBy?.id).toBe(staff.orgUserId);
    expect(view.comments).toHaveLength(2);
  });

  it('does not serve a removed comment that has no replies', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'oops',
    });
    await service.remove('o1', root.id, learner);
    const view = await service.listThread('o1', 'a1', learner);
    expect(view.comments).toHaveLength(0);
  });

  it('hides a removed comment whose only reply this reader cannot see', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const root = await service.post('o1', staff, {
      activityId: 'a1', parentId: null, body: 'root',
    });
    // The only reply is another learner's, still awaiting review.
    await service.post('o1', learner, {
      activityId: 'a1', parentId: root.id, body: 'pending reply',
    });
    await service.remove('o1', root.id, staff);

    const other: Actor = { orgUserId: 'orm_other', role: 'student' };
    const theirs = await service.listThread('o1', 'a1', other);
    expect(theirs.comments).toHaveLength(0);

    // Its author still sees both the reply and the placeholder holding it.
    const own = await service.listThread('o1', 'a1', learner);
    expect(own.comments).toHaveLength(2);
  });

  it('never serves a removed reply', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.post('o1', staff, {
      activityId: 'a1', parentId: null, body: 'root',
    });
    const reply = await service.post('o1', learner, {
      activityId: 'a1', parentId: root.id, body: 'reply',
    });
    await service.remove('o1', reply.id, learner);
    const view = await service.listThread('o1', 'a1', learner);
    expect(view.comments.map((c) => c.id)).toEqual([root.id]);
  });

  it('groups reactions by emoji and flags the reader own', async () => {
    const { service } = makeService();
    await enabled(service);
    const c = await service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'hi',
    });
    await service.react('o1', c.id, learner, '👍');
    await service.react('o1', c.id, staff, '👍');

    const view = await service.listThread('o1', 'a1', learner);
    expect(view.comments[0]?.reactions).toEqual([{ emoji: '👍', count: 2, reacted: true }]);

    const other: Actor = { orgUserId: 'orm_other', role: 'student' };
    const theirs = await service.listThread('o1', 'a1', other);
    expect(theirs.comments[0]?.reactions).toEqual([{ emoji: '👍', count: 2, reacted: false }]);
  });

  it('throws NotFoundError rather than render an unresolved author as a student', async () => {
    const fake = fakeRepo();
    const { service } = makeService(fake);
    await enabled(service);
    await service.post('o1', learner, { activityId: 'a1', parentId: null, body: 'hi' });
    fake.repo.authorsOf = async () => ({});
    await expect(service.listThread('o1', 'a1', learner)).rejects.toThrow(NotFoundError);
  });
});

describe('edit, remove, restore, approve', () => {
  async function published() {
    const ctx = makeService();
    await enabled(ctx.service);
    const comment = await ctx.service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'original',
    });
    return { ...ctx, comment };
  }

  it('lets an author edit their own comment', async () => {
    const { service, comment } = await published();
    const edited = await service.edit('o1', comment.id, learner, 'revised');
    expect(edited.body).toBe('revised');
    expect(edited.author.id).toBe(learner.orgUserId);
  });

  it('refuses an edit by anyone else, including staff', async () => {
    const { service, comment } = await published();
    await expect(service.edit('o1', comment.id, staff, 'nope')).rejects.toThrow(ForbiddenError);
  });

  it('refuses an edit on a locked thread, even by the author', async () => {
    const { service, comment } = await published();
    await service.setThreadState('o1', 'a1', 'locked');
    await expect(service.edit('o1', comment.id, learner, 'revised')).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('lets an author remove their own comment and names them as remover', async () => {
    const { service, comment, appended } = await published();
    const removed = await service.remove('o1', comment.id, learner);
    expect(removed.status).toBe('removed');
    expect(removed.removedBy).toBe(learner.orgUserId);
    expect(appended.at(-1)).toMatchObject({
      type: 'comment.removed',
      removedBy: learner.orgUserId,
    });
  });

  it('lets staff remove another person comment', async () => {
    const { service, comment } = await published();
    const removed = await service.remove('o1', comment.id, staff);
    expect(removed.removedBy).toBe(staff.orgUserId);
  });

  it('refuses removal by an unrelated learner', async () => {
    const { service, comment } = await published();
    const other: Actor = { orgUserId: 'orm_other', role: 'student' };
    await expect(service.remove('o1', comment.id, other)).rejects.toThrow(ForbiddenError);
  });

  it('restores a removed comment to published, staff only', async () => {
    const { service, comment } = await published();
    await service.remove('o1', comment.id, staff);
    await expect(service.restore('o1', comment.id, learner)).rejects.toThrow(ForbiddenError);
    const restored = await service.restore('o1', comment.id, staff);
    expect(restored.status).toBe('published');
    expect(restored.removedBy).toBeNull();
  });

  it('approves a pending comment and emits comment.published', async () => {
    const { service, appended } = makeService();
    await enabled(service, { requireReview: true });
    const pending = await service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'q',
    });
    await expect(service.approve('o1', pending.id, learner)).rejects.toThrow(ForbiddenError);
    const approved = await service.approve('o1', pending.id, staff);
    expect(approved.status).toBe('published');
    expect(appended.at(-1)?.type).toBe('comment.published');
  });

  it('refuses to approve a comment that is not pending', async () => {
    const { service, comment } = await published();
    await expect(service.approve('o1', comment.id, staff)).rejects.toThrow(ForbiddenError);
  });

  it('removing an already-removed comment is idempotent', async () => {
    const { service, comment, appended } = await published();
    await service.remove('o1', comment.id, staff);
    const before = appended.length;
    const again = await service.remove('o1', comment.id, staff);
    expect(again.status).toBe('removed');
    expect(appended).toHaveLength(before);
  });

  it('edit emits no event', async () => {
    const { service, comment, appended } = await published();
    const before = appended.length;
    await service.edit('o1', comment.id, learner, 'revised');
    expect(appended).toHaveLength(before);
  });

  it('restore emits no event', async () => {
    const { service, comment, appended } = await published();
    await service.remove('o1', comment.id, staff);
    const before = appended.length;
    await service.restore('o1', comment.id, staff);
    expect(appended).toHaveLength(before);
  });

  it('throws NotFoundError from edit when the comment vanishes mid-write', async () => {
    const fake = fakeRepo();
    const { service } = makeService(fake);
    await enabled(service);
    const comment = await service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'original',
    });
    fake.repo.updateComment = async () => null;
    await expect(service.edit('o1', comment.id, learner, 'revised')).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws NotFoundError from restore when the comment vanishes mid-write', async () => {
    const fake = fakeRepo();
    const { service } = makeService(fake);
    await enabled(service);
    const comment = await service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'original',
    });
    await service.remove('o1', comment.id, staff);
    fake.repo.updateComment = async () => null;
    await expect(service.restore('o1', comment.id, staff)).rejects.toThrow(NotFoundError);
  });
});

describe('publish', () => {
  async function publishedComment() {
    const ctx = makeService();
    await enabled(ctx.service);
    const comment = await ctx.service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'original',
    });
    return { ...ctx, comment };
  }

  it('dispatches to approve for a pending comment and emits comment.published', async () => {
    const { service, appended } = makeService();
    await enabled(service, { requireReview: true });
    const pending = await service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'q',
    });
    const result = await service.publish('o1', pending.id, staff);
    expect(result.status).toBe('published');
    expect(appended.at(-1)?.type).toBe('comment.published');
  });

  it('dispatches to restore for a removed comment', async () => {
    const { service, comment } = await publishedComment();
    await service.remove('o1', comment.id, staff);
    const result = await service.publish('o1', comment.id, staff);
    expect(result.status).toBe('published');
    expect(result.removedBy).toBeNull();
  });

  it('refuses a comment that is already published', async () => {
    const { service, comment } = await publishedComment();
    await expect(service.publish('o1', comment.id, staff)).rejects.toThrow(ForbiddenError);
  });

  it('refuses a learner, regardless of the comment state', async () => {
    const { service, comment } = await publishedComment();
    await expect(service.publish('o1', comment.id, learner)).rejects.toThrow(ForbiddenError);
  });
});

describe('reactions', () => {
  async function withComment(patch = {}) {
    const ctx = makeService();
    await enabled(ctx.service, patch);
    const comment = await ctx.service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'hi',
    });
    return { ...ctx, comment };
  }

  it('is idempotent for the same person and emoji', async () => {
    const { service, comment, reactions } = await withComment();
    await service.react('o1', comment.id, learner, '👍');
    await service.react('o1', comment.id, learner, '👍');
    expect(reactions).toHaveLength(1);
  });

  it('removes a reaction', async () => {
    const { service, comment, reactions } = await withComment();
    await service.react('o1', comment.id, learner, '👍');
    await service.unreact('o1', comment.id, learner, '👍');
    expect(reactions).toHaveLength(0);
  });

  it('emits no event', async () => {
    const { service, comment, appended } = await withComment();
    const before = appended.length;
    await service.react('o1', comment.id, learner, '👍');
    expect(appended).toHaveLength(before);
  });

  it('refuses when reactions are disabled', async () => {
    const { service, comment } = await withComment({ reactions: false });
    await expect(service.react('o1', comment.id, learner, '👍')).rejects.toThrow(ForbiddenError);
  });

  it('refuses on a locked thread', async () => {
    const { service, comment } = await withComment();
    await service.setThreadState('o1', 'a1', 'locked');
    await expect(service.react('o1', comment.id, learner, '👍')).rejects.toThrow(ForbiddenError);
  });

  it('refuses to remove a reaction on a locked thread', async () => {
    const { service, comment } = await withComment();
    await service.react('o1', comment.id, learner, '👍');
    await service.setThreadState('o1', 'a1', 'locked');
    await expect(service.unreact('o1', comment.id, learner, '👍')).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('refuses a reaction on a hidden thread', async () => {
    const { service, comment } = await withComment();
    await service.setThreadState('o1', 'a1', 'hidden');
    await expect(service.react('o1', comment.id, learner, '👍')).rejects.toThrow(ForbiddenError);
  });

  it('still lets a reaction be withdrawn after reactions are disabled', async () => {
    const { service, comment, reactions } = await withComment();
    await service.react('o1', comment.id, learner, '👍');
    await service.setSettings('o1', 'c1', { reactions: false });
    await service.unreact('o1', comment.id, learner, '👍');
    expect(reactions).toHaveLength(0);
  });
});

describe('reports and queue', () => {
  async function withComment() {
    const ctx = makeService();
    await enabled(ctx.service);
    const comment = await ctx.service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'bad',
    });
    return { ...ctx, comment };
  }

  it('does not change the comment status', async () => {
    const { service, comment } = await withComment();
    await service.report('o1', comment.id, staff, 'abuse');
    const after = await service.listThread('o1', 'a1', staff);
    expect(after.comments[0]?.status).toBe('published');
  });

  it('emits comment.reported', async () => {
    const { service, comment, appended } = await withComment();
    await service.report('o1', comment.id, staff, 'abuse');
    expect(appended.at(-1)?.type).toBe('comment.reported');
  });

  it('is one report per person per comment and emits once', async () => {
    const { service, comment, reports, appended } = await withComment();
    await service.report('o1', comment.id, staff, 'first');
    const before = appended.length;
    await service.report('o1', comment.id, staff, 'second');
    expect(reports).toHaveLength(1);
    expect(appended).toHaveLength(before);
  });

  it('accepts a report on a locked thread', async () => {
    const { service, comment, reports } = await withComment();
    await service.setThreadState('o1', 'a1', 'locked');
    await service.report('o1', comment.id, staff, 'still bad');
    expect(reports).toHaveLength(1);
  });

  it('refuses a report on a hidden thread', async () => {
    const { service, comment } = await withComment();
    await service.setThreadState('o1', 'a1', 'hidden');
    await expect(service.report('o1', comment.id, staff, 'x')).rejects.toThrow(ForbiddenError);
  });

  it('lists a reported comment with its author, activity and reports', async () => {
    const fake = fakeRepo();
    fake.authors.set('orm_learner', {
      id: 'orm_learner', name: 'Ana Diaz', image: null, role: 'student',
      email: 'ana@example.test',
    });
    const { service, comment } = await (async () => {
      const ctx = makeService(fake);
      await enabled(ctx.service);
      const c = await ctx.service.post('o1', learner, {
        activityId: 'a1', parentId: null, body: 'bad',
      });
      return { ...ctx, comment: c };
    })();
    const other: Actor = { orgUserId: 'orm_other', role: 'student' };
    await service.report('o1', comment.id, staff, 'spam');
    await service.report('o1', comment.id, other, 'rude');

    const entries = await service.queue('o1', { kind: 'reported', courseId: 'c1' });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.comment.id).toBe(comment.id);
    expect(entries[0]?.author.name).toBe('Ana Diaz');
    expect(entries[0]?.authorEmail).toBe('ana@example.test');
    expect(entries[0]?.activityTitle).toBe('Lesson one');
    expect(entries[0]?.courseId).toBe('c1');
    expect(entries[0]?.reports.map((r) => r.reason).sort()).toEqual(['rude', 'spam']);
    expect(entries[0]?.reports.map((r) => r.reporter.id).sort()).toEqual(
      [staff.orgUserId, other.orgUserId].sort(),
    );
    expect('email' in entries[0]!.reports[0]!.reporter).toBe(false);
  });

  it('drops a comment out of the reported queue once its reports resolve', async () => {
    const { service, comment } = await withComment();
    await service.report('o1', comment.id, staff, 'a');
    await service.resolveReports('o1', comment.id, staff);
    expect(await service.queue('o1', { kind: 'reported', courseId: 'c1' })).toHaveLength(0);
  });

  it('resolves every open report on a comment, not just one', async () => {
    const { service, comment, reports } = await withComment();
    const other: Actor = { orgUserId: 'orm_other', role: 'student' };
    await service.report('o1', comment.id, staff, 'a');
    await service.report('o1', comment.id, other, 'b');

    const before = await service.queue('o1', { kind: 'reported', courseId: 'c1' });
    expect(before).toHaveLength(1);
    expect(before[0]?.reports).toHaveLength(2);

    await service.resolveReports('o1', comment.id, staff);

    expect(await service.queue('o1', { kind: 'reported', courseId: 'c1' })).toHaveLength(0);
    expect(reports.every((r) => r.resolvedAt !== null)).toBe(true);
  });

  it('scopes the reported queue to the requested course', async () => {
    const { service, comment } = await withComment();
    await service.report('o1', comment.id, staff, 'a');
    expect(await service.queue('o1', { kind: 'reported', courseId: 'c2' })).toHaveLength(0);
    expect(await service.queue('o1', { kind: 'reported', courseId: 'c1' })).toHaveLength(1);
  });

  it('returns the report that actually exists on a duplicate, not a fabricated one', async () => {
    const { service, comment } = await withComment();
    const first = await service.report('o1', comment.id, staff, 'first');
    const second = await service.report('o1', comment.id, staff, 'second');
    expect(second.id).toBe(first.id);
  });

  it('lists pending comments in the queue', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const pending = await service.post('o1', learner, {
      activityId: 'a1', parentId: null, body: 'q',
    });
    const entries = await service.queue('o1', { kind: 'pending', courseId: 'c1' });
    expect(entries.map((e) => e.comment.id)).toEqual([pending.id]);
  });

  it('scopes the queue to the requested course', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    await service.post('o1', learner, { activityId: 'a1', parentId: null, body: 'q' });
    expect(await service.queue('o1', { kind: 'pending', courseId: 'c2' })).toHaveLength(0);
    expect(await service.queue('o1', { kind: 'pending' })).toHaveLength(1);
  });

  it('refuses resolution by a learner', async () => {
    const { service, comment } = await withComment();
    await service.report('o1', comment.id, staff, 'a');
    await expect(service.resolveReports('o1', comment.id, learner)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('throws NotFoundError from the queue rather than a blank id/email placeholder', async () => {
    const fake = fakeRepo();
    const { service } = makeService(fake);
    await enabled(service, { requireReview: true });
    await service.post('o1', learner, { activityId: 'a1', parentId: null, body: 'q' });
    fake.repo.authorsOf = async () => ({});
    await expect(service.queue('o1', { kind: 'pending', courseId: 'c1' })).rejects.toThrow(
      NotFoundError,
    );
  });
});
