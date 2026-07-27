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
import { NotFoundError } from '../shared/errors.js';

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

  it('lists only the activities in the course that carry an override', async () => {
    const { service } = makeService();
    await service.setThreadState('o1', 'a1', 'locked');
    expect(await service.listThreadStates('o1', 'c1')).toEqual({ a1: 'locked' });
  });
});
