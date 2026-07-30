import { describe, it, expect } from 'vitest';
import { DiscussionServiceImpl, DEFAULT_SETTINGS } from './service.js';
import type {
  AuthorRecord,
  CommentWithContext,
  CourseAccessReader,
  DiscussionRepository,
  DiscussionUnitOfWork,
} from './ports.js';
import type { Comment, CommentReaction, CommentReport, CommentSettings } from './model.js';
import type { NewDiscussionEvent } from './events.js';
import { NotFoundError, ForbiddenError } from '../shared/errors.js';
import {
  SettingsNamespace,
  SettingsService,
  type SettingsRecord,
  type SettingsRepository,
} from '../shared/settings.js';
import type { Actor } from './ports.js';
import type { ListCommentsQuery } from './types.js';

/** Paging is required on the comment-list query; the tests are about filters. */
function q(filters: Partial<ListCommentsQuery> = {}): ListCommentsQuery {
  return { page: 1, pageSize: 20, ...filters };
}

/** Every activity in these tests belongs to course c1 unless a test says
 *  otherwise — the service resolves the course rather than being handed it. */
export function fakeRepo() {
  const comments: Comment[] = [];
  const reactions: CommentReaction[] = [];
  const reports: CommentReport[] = [];
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

  function withContext(comment: Comment): CommentWithContext {
    return {
      comment,
      courseId: activityCourse.get(comment.activityId) ?? '',
      activityTitle: activityTitle.get(comment.activityId) ?? '',
    };
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
    async insertReaction(orgId, reaction) {
      const existing = reactions.find(
        (r) =>
          r.orgId === orgId &&
          r.commentId === reaction.commentId &&
          r.orgUserId === reaction.orgUserId &&
          r.emoji === reaction.emoji,
      );
      if (existing) {
        return { ...existing };
      }
      const stored: CommentReaction = {
        ...reaction,
        orgId,
        createdAt: new Date().toISOString(),
      };
      reactions.push(stored);
      return { ...stored };
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
    async courseOfActivity(_orgId, activityId) {
      return activityCourse.get(activityId) ?? null;
    },
    async listComments(orgId, query) {
      const open = new Set(reports.filter((r) => !r.resolvedAt).map((r) => r.commentId));
      const matched = comments
        .filter((c) => c.orgId === orgId)
        .map(withContext)
        .filter((e) => {
          const c = e.comment;
          if (query.status && c.status !== query.status) {
            return false;
          }
          if (query.courseId && e.courseId !== query.courseId) {
            return false;
          }
          if (query.activityId && c.activityId !== query.activityId) {
            return false;
          }
          if (query.orgUserId && c.orgUserId !== query.orgUserId) {
            return false;
          }
          if (query.reported !== undefined && open.has(c.id) !== query.reported) {
            return false;
          }
          if (query.search && !c.body.toLowerCase().includes(query.search.toLowerCase())) {
            return false;
          }
          return true;
        })
        .sort((a, b) => b.comment.createdAt.localeCompare(a.comment.createdAt));
      const from = (query.page - 1) * query.pageSize;
      return {
        rows: matched.slice(from, from + query.pageSize),
        total: matched.length,
        page: query.page,
        pageSize: query.pageSize,
      };
    },
    async authorsOf(_orgId, orgUserIds) {
      const out: Record<string, AuthorRecord> = {};
      for (const id of orgUserIds) {
        out[id] = author(id);
      }
      return out;
    },
  };
  return { repo, comments, reactions, reports, authors, activityCourse };
}

/** The cross-cutting settings store, in memory. Discussion's configuration is
 *  rows in here under the `discussion` namespace — the course's settings scoped
 *  by course id, an activity's comments-state override by activity id. */
export function fakeSettings() {
  const rows = new Map<string, Record<string, unknown>>();
  const repo: SettingsRepository = {
    async find(orgId, scopeId, namespace) {
      const out: SettingsRecord[] = [];
      for (const [key, value] of rows) {
        const [rowOrg, rowNs, rowScope] = key.split(':');
        if (rowOrg === orgId && rowScope === scopeId && (!namespace || rowNs === namespace)) {
          out.push({ namespace: rowNs!, scopeId: rowScope!, value });
        }
      }
      return out;
    },
    async patch(orgId, namespace, scopeId, value) {
      const key = `${orgId}:${namespace}:${scopeId}`;
      // Shallow is enough: every discussion value is a flat object.
      const merged = { ...(rows.get(key) ?? {}), ...(value as Record<string, unknown>) };
      rows.set(key, merged);
      return { namespace, scopeId, value: merged };
    },
  };
  return { settings: new SettingsService(repo), rows };
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

/** Course access, as entitlements would answer it. Everyone is in unless a
 *  test bars them from a course. */
export function fakeAccess() {
  const barred = new Set<string>();
  const access: CourseAccessReader = {
    async hasCourseAccess(_orgId, orgUserId, courseId) {
      return !barred.has(`${orgUserId}:${courseId}`);
    },
  };
  return {
    access,
    bar: (orgUserId: string, courseId: string) => barred.add(`${orgUserId}:${courseId}`),
  };
}

/** Discussion no longer writes its own configuration — the settings store does.
 *  Keeping the store beside the service it was built with lets the helpers
 *  below configure a course without every test threading it through. */
const storeOf = new WeakMap<DiscussionServiceImpl, SettingsService>();

export function makeService(fake = fakeRepo(), gate = fakeAccess()) {
  const { uow, appended } = fakeUow(fake.repo);
  const { settings, rows } = fakeSettings();
  const service = new DiscussionServiceImpl({
    repo: fake.repo,
    access: gate.access,
    uow,
    settings,
    now: () => '2026-07-27T00:00:00.000Z',
  });
  storeOf.set(service, settings);
  return { service, appended, settings, settingsRows: rows, bar: gate.bar, ...fake };
}

/** Write a course's discussion settings the way the settings surface would. */
function setSettings(
  service: DiscussionServiceImpl,
  courseId: string,
  patch: Partial<CommentSettings>,
): Promise<unknown> {
  return storeOf.get(service)!.patch('o1', SettingsNamespace.discussion, courseId, patch);
}

/** Write an activity's comments-state override. `null` clears it: the key stays
 *  in the stored value, and a null state reads as "no override". */
function setCommentsState(
  service: DiscussionServiceImpl,
  activityId: string,
  state: 'visible' | 'hidden' | 'locked' | null,
): Promise<unknown> {
  return storeOf.get(service)!.patch('o1', SettingsNamespace.discussion, activityId, { state });
}

describe('settings', () => {


  it('reads a partial stored value over the defaults', async () => {
    const { service } = makeService();
    await setSettings(service, 'c1', { enabled: true, requireReview: true });
    expect(await service.resolveConfig('o1', 'a1')).toEqual({
      enabled: true,
      threaded: true,
      requireReview: true,
      reactions: true,
      state: 'visible',
    });
  });

  it('scopes the settings row to the course the activity resolves to', async () => {
    const { service } = makeService();
    // Written against c2, which holds neither a1 nor a2 — a1 must not see it.
    await setSettings(service, 'c2', { enabled: true });
    expect((await service.resolveConfig('o1', 'a1')).enabled).toBe(false);
  });

  it('throws NotFoundError for an activity that does not exist', async () => {
    const { service } = makeService();
    await expect(service.resolveConfig('o1', 'nope')).rejects.toThrow(NotFoundError);
  });

  it("lets an activity's comments state override the course", async () => {
    const { service } = makeService();
    await setSettings(service, 'c1', { enabled: true });
    await setCommentsState(service, 'a1', 'locked');
    expect((await service.resolveConfig('o1', 'a1')).state).toBe('locked');
  });

  it('leaves the sibling activity on the course setting', async () => {
    const { service } = makeService();
    await setSettings(service, 'c1', { enabled: true });
    await setCommentsState(service, 'a1', 'locked');
    expect((await service.resolveConfig('o1', 'a2')).state).toBe('visible');
  });

  it('falls back to the course setting once the override is cleared', async () => {
    const { service } = makeService();
    await setSettings(service, 'c1', { enabled: true });
    await setCommentsState(service, 'a1', 'hidden');
    await setCommentsState(service, 'a1', null);
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
    await setSettings(service, 'c1', { enabled: false });
    await setCommentsState(service, 'a1', 'visible');
    expect((await service.resolveConfig('o1', 'a1')).state).toBe('hidden');
  });
});

const learner: Actor = { orgUserId: 'orm_learner', role: 'student' };
const staff: Actor = { orgUserId: 'orm_staff', role: 'instructor' };

async function enabled(service: DiscussionServiceImpl, patch: Partial<CommentSettings> = {}) {
  await setSettings(service, 'c1', { enabled: true, ...patch });
}

describe('course access', () => {
  it('serves a learner nothing for a course they hold no access to', async () => {
    const { service, bar } = makeService();
    await enabled(service);
    bar('orm_learner', 'c1');
    await expect(service.activityComments('o1', 'a1', learner)).rejects.toThrow(NotFoundError);
  });

  it('refuses a learner post to a course they hold no access to', async () => {
    const { service, bar } = makeService();
    await enabled(service);
    bar('orm_learner', 'c1');
    await expect(
      service.postComment('o1', learner, { activityId: 'a1', parentId: null, body: 'x' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('404s a learner acting on a comment once their access is gone', async () => {
    const { service, bar } = makeService();
    await enabled(service);
    const comment = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'mine',
    });
    bar('orm_learner', 'c1');
    // Their own comment, and it is still there — reach is what they lost.
    await expect(service.edit('o1', comment.id, learner, 'edited')).rejects.toThrow(NotFoundError);
    await expect(service.remove('o1', comment.id, learner)).rejects.toThrow(NotFoundError);
    await expect(service.react('o1', comment.id, learner, '👍')).rejects.toThrow(NotFoundError);
    await expect(service.reportComment('o1', comment.id, learner, 'spam')).rejects.toThrow(NotFoundError);
  });

  it('404s a learner for an activity that does not exist', async () => {
    const { service } = makeService();
    await expect(service.activityComments('o1', 'nope', learner)).rejects.toThrow(NotFoundError);
  });

  it('does not check access for staff — moderators are not enrolled', async () => {
    const { service, bar } = makeService();
    await enabled(service);
    const comment = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'reported',
    });
    bar('orm_staff', 'c1');
    expect((await service.remove('o1', comment.id, staff)).status).toBe('removed');
  });
});

describe('post', () => {
  it('publishes a learner comment when review is off', async () => {
    const { service, appended } = makeService();
    await enabled(service);
    const comment = await service.postComment('o1', learner, {
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
    const comment = await service.postComment('o1', staff, {
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
    const comment = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'q',
    });
    expect(comment.status).toBe('pending');
  });

  it('publishes a staff comment even when review is on', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const comment = await service.postComment('o1', staff, {
      activityId: 'a1',
      parentId: null,
      body: 'answer',
    });
    expect(comment.status).toBe('published');
  });

  it('refuses to post when discussion is disabled for the course', async () => {
    const { service } = makeService();
    await expect(
      service.postComment('o1', learner, { activityId: 'a1', parentId: null, body: 'x' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses to post when comments are locked', async () => {
    const { service } = makeService();
    await enabled(service);
    await setCommentsState(service, 'a1', 'locked');
    await expect(
      service.postComment('o1', learner, { activityId: 'a1', parentId: null, body: 'x' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reply when replies are disabled', async () => {
    const { service } = makeService();
    await enabled(service, { threaded: false });
    const root = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    await expect(
      service.postComment('o1', learner, { activityId: 'a1', parentId: root.id, body: 'reply' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reply to a reply — nesting is one level', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    const reply = await service.postComment('o1', staff, {
      activityId: 'a1',
      parentId: root.id,
      body: 'reply',
    });
    await expect(
      service.postComment('o1', learner, { activityId: 'a1', parentId: reply.id, body: 'nested' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reply to a pending comment', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const pending = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'q',
    });
    await expect(
      service.postComment('o1', staff, { activityId: 'a1', parentId: pending.id, body: 'reply' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reply to a comment on a different activity', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    await expect(
      service.postComment('o1', learner, { activityId: 'a2', parentId: root.id, body: 'reply' }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('activityComments', () => {
  it('serves a pending comment to its author but not to another learner', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const pending = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'q',
    });

    const own = await service.activityComments('o1', 'a1', learner);
    expect(own.comments.map((c) => c.id)).toContain(pending.id);

    const other: Actor = { orgUserId: 'orm_other', role: 'student' };
    const theirs = await service.activityComments('o1', 'a1', other);
    expect(theirs.comments).toHaveLength(0);

    const moderator = await service.activityComments('o1', 'a1', staff);
    expect(moderator.comments.map((c) => c.id)).toContain(pending.id);
  });

  it('resolves the author from their current role and omits their email', async () => {
    const fake = fakeRepo();
    fake.authors.set('orm_staff', {
      id: 'orm_staff',
      name: 'Sarah Chen',
      image: null,
      role: 'instructor',
      email: 'sarah@example.test',
    });
    const { service } = makeService(fake);
    await enabled(service);
    await service.postComment('o1', staff, { activityId: 'a1', parentId: null, body: 'hello' });
    const view = await service.activityComments('o1', 'a1', learner);
    expect(view.comments[0]?.author).toEqual({
      id: 'orm_staff',
      name: 'Sarah Chen',
      image: null,
      role: 'instructor',
    });
  });

  it('flags a comment as the reader own only for its author', async () => {
    const { service } = makeService();
    await enabled(service);
    await service.postComment('o1', learner, { activityId: 'a1', parentId: null, body: 'mine' });
    expect((await service.activityComments('o1', 'a1', learner)).comments[0]?.isOwn).toBe(true);
    expect((await service.activityComments('o1', 'a1', staff)).comments[0]?.isOwn).toBe(false);
  });

  it('serves nothing when comments are hidden', async () => {
    const { service } = makeService();
    await enabled(service);
    await service.postComment('o1', learner, { activityId: 'a1', parentId: null, body: 'hi' });
    await setCommentsState(service, 'a1', 'hidden');
    const view = await service.activityComments('o1', 'a1', learner);
    expect(view.comments).toHaveLength(0);
    expect(view.config.state).toBe('hidden');
  });

  it('serves a removed comment as a placeholder when its reply is visible', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'bad',
    });
    await service.postComment('o1', staff, {
      activityId: 'a1',
      parentId: root.id,
      body: 'reply',
    });
    await service.remove('o1', root.id, staff);

    const view = await service.activityComments('o1', 'a1', learner);
    const placeholder = view.comments.find((c) => c.id === root.id);
    expect(placeholder?.body).toBeNull();
    expect(placeholder?.status).toBe('removed');
    expect(placeholder?.removedBy?.id).toBe(staff.orgUserId);
    expect(view.comments).toHaveLength(2);
  });

  it('does not serve a removed comment that has no replies', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'oops',
    });
    await service.remove('o1', root.id, learner);
    const view = await service.activityComments('o1', 'a1', learner);
    expect(view.comments).toHaveLength(0);
  });

  it('hides a removed comment whose only reply this reader cannot see', async () => {
    const { service } = makeService();
    await enabled(service, { requireReview: true });
    const root = await service.postComment('o1', staff, {
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    // The only reply is another learner's, still awaiting review.
    await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: root.id,
      body: 'pending reply',
    });
    await service.remove('o1', root.id, staff);

    const other: Actor = { orgUserId: 'orm_other', role: 'student' };
    const theirs = await service.activityComments('o1', 'a1', other);
    expect(theirs.comments).toHaveLength(0);

    // Its author still sees both the reply and the placeholder holding it.
    const own = await service.activityComments('o1', 'a1', learner);
    expect(own.comments).toHaveLength(2);
  });

  it('never serves a removed reply', async () => {
    const { service } = makeService();
    await enabled(service);
    const root = await service.postComment('o1', staff, {
      activityId: 'a1',
      parentId: null,
      body: 'root',
    });
    const reply = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: root.id,
      body: 'reply',
    });
    await service.remove('o1', reply.id, learner);
    const view = await service.activityComments('o1', 'a1', learner);
    expect(view.comments.map((c) => c.id)).toEqual([root.id]);
  });

  it('groups reactions by emoji and flags the reader own', async () => {
    const { service } = makeService();
    await enabled(service);
    const c = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'hi',
    });
    await service.react('o1', c.id, learner, '👍');
    await service.react('o1', c.id, staff, '👍');

    const view = await service.activityComments('o1', 'a1', learner);
    expect(view.comments[0]?.reactions).toEqual([{ emoji: '👍', count: 2, reacted: true }]);

    const other: Actor = { orgUserId: 'orm_other', role: 'student' };
    const theirs = await service.activityComments('o1', 'a1', other);
    expect(theirs.comments[0]?.reactions).toEqual([{ emoji: '👍', count: 2, reacted: false }]);
  });

  it('throws NotFoundError rather than render an unresolved author as a student', async () => {
    const fake = fakeRepo();
    const { service } = makeService(fake);
    await enabled(service);
    await service.postComment('o1', learner, { activityId: 'a1', parentId: null, body: 'hi' });
    fake.repo.authorsOf = async () => ({});
    await expect(service.activityComments('o1', 'a1', learner)).rejects.toThrow(NotFoundError);
  });
});

describe('edit, remove, restore, approve', () => {
  async function published() {
    const ctx = makeService();
    await enabled(ctx.service);
    const comment = await ctx.service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'original',
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

  it('refuses an edit when comments are locked, even by the author', async () => {
    const { service, comment } = await published();
    await setCommentsState(service, 'a1', 'locked');
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
    const pending = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'q',
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
    const comment = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'original',
    });
    fake.repo.updateComment = async () => null;
    await expect(service.edit('o1', comment.id, learner, 'revised')).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError from restore when the comment vanishes mid-write', async () => {
    const fake = fakeRepo();
    const { service } = makeService(fake);
    await enabled(service);
    const comment = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'original',
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
    const comment = await ctx.service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'original',
    });
    return { ...ctx, comment };
  }

  it('dispatches to approve for a pending comment and emits comment.published', async () => {
    const { service, appended } = makeService();
    await enabled(service, { requireReview: true });
    const pending = await service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'q',
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
    const comment = await ctx.service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'hi',
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

  it('refuses when comments are locked', async () => {
    const { service, comment } = await withComment();
    await setCommentsState(service, 'a1', 'locked');
    await expect(service.react('o1', comment.id, learner, '👍')).rejects.toThrow(ForbiddenError);
  });

  it('refuses to remove a reaction when comments are locked', async () => {
    const { service, comment } = await withComment();
    await service.react('o1', comment.id, learner, '👍');
    await setCommentsState(service, 'a1', 'locked');
    await expect(service.unreact('o1', comment.id, learner, '👍')).rejects.toThrow(ForbiddenError);
  });

  it('refuses a reaction when comments are hidden', async () => {
    const { service, comment } = await withComment();
    await setCommentsState(service, 'a1', 'hidden');
    await expect(service.react('o1', comment.id, learner, '👍')).rejects.toThrow(ForbiddenError);
  });

  it('still lets a reaction be withdrawn after reactions are disabled', async () => {
    const { service, comment, reactions } = await withComment();
    await service.react('o1', comment.id, learner, '👍');
    await setSettings(service, 'c1', { reactions: false });
    await service.unreact('o1', comment.id, learner, '👍');
    expect(reactions).toHaveLength(0);
  });
});

describe('reports', () => {
  async function withComment() {
    const ctx = makeService();
    await enabled(ctx.service);
    const comment = await ctx.service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'bad',
    });
    return { ...ctx, comment };
  }

  it('does not change the comment status', async () => {
    const { service, comment } = await withComment();
    await service.reportComment('o1', comment.id, staff, 'abuse');
    const after = await service.activityComments('o1', 'a1', staff);
    expect(after.comments[0]?.status).toBe('published');
  });

  it('emits comment.reported', async () => {
    const { service, comment, appended } = await withComment();
    await service.reportComment('o1', comment.id, staff, 'abuse');
    expect(appended.at(-1)?.type).toBe('comment.reported');
  });

  it('is one report per person per comment and emits once', async () => {
    const { service, comment, reports, appended } = await withComment();
    await service.reportComment('o1', comment.id, staff, 'first');
    const before = appended.length;
    await service.reportComment('o1', comment.id, staff, 'second');
    expect(reports).toHaveLength(1);
    expect(appended).toHaveLength(before);
  });

  it('accepts a report when comments are locked', async () => {
    const { service, comment, reports } = await withComment();
    await setCommentsState(service, 'a1', 'locked');
    await service.reportComment('o1', comment.id, staff, 'still bad');
    expect(reports).toHaveLength(1);
  });

  it('refuses a report when comments are hidden', async () => {
    const { service, comment } = await withComment();
    await setCommentsState(service, 'a1', 'hidden');
    await expect(service.reportComment('o1', comment.id, staff, 'x')).rejects.toThrow(ForbiddenError);
  });

  it('lists a reported comment with its author, activity and reports', async () => {
    const fake = fakeRepo();
    fake.authors.set('orm_learner', {
      id: 'orm_learner',
      name: 'Ana Diaz',
      image: null,
      role: 'student',
      email: 'ana@example.test',
    });
    const { service, comment } = await (async () => {
      const ctx = makeService(fake);
      await enabled(ctx.service);
      const c = await ctx.service.postComment('o1', learner, {
        activityId: 'a1',
        parentId: null,
        body: 'bad',
      });
      return { ...ctx, comment: c };
    })();
    const other: Actor = { orgUserId: 'orm_other', role: 'student' };
    await service.reportComment('o1', comment.id, staff, 'spam');
    await service.reportComment('o1', comment.id, other, 'rude');

    const { rows } = await service.listComments('o1', q({ reported: true, courseId: 'c1' }));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(comment.id);
    expect(rows[0]?.body).toBe('bad');
    expect(rows[0]?.author.name).toBe('Ana Diaz');
    expect(rows[0]?.authorEmail).toBe('ana@example.test');
    expect(rows[0]?.activityId).toBe('a1');
    expect(rows[0]?.activityTitle).toBe('Lesson one');
    expect(rows[0]?.courseId).toBe('c1');
    expect(rows[0]?.reports.map((r) => r.reason).sort()).toEqual(['rude', 'spam']);
    expect(rows[0]?.reports.map((r) => r.reporter.id).sort()).toEqual(
      [staff.orgUserId, other.orgUserId].sort(),
    );
    expect('email' in rows[0]!.reports[0]!.reporter).toBe(false);
  });

  it('drops a comment out of the reported filter once its reports resolve', async () => {
    const { service, comment } = await withComment();
    await service.reportComment('o1', comment.id, staff, 'a');
    await service.resolveReports('o1', comment.id, staff);
    const { rows } = await service.listComments('o1', q({ reported: true, courseId: 'c1' }));
    expect(rows).toHaveLength(0);
  });

  it('resolves every open report on a comment, not just one', async () => {
    const { service, comment, reports } = await withComment();
    const other: Actor = { orgUserId: 'orm_other', role: 'student' };
    await service.reportComment('o1', comment.id, staff, 'a');
    await service.reportComment('o1', comment.id, other, 'b');

    const before = await service.listComments('o1', q({ reported: true, courseId: 'c1' }));
    expect(before.rows).toHaveLength(1);
    expect(before.rows[0]?.reports).toHaveLength(2);

    await service.resolveReports('o1', comment.id, staff);

    const after = await service.listComments('o1', q({ reported: true, courseId: 'c1' }));
    expect(after.rows).toHaveLength(0);
    expect(reports.every((r) => r.resolvedAt !== null)).toBe(true);
  });

  it('returns the report that actually exists on a duplicate, not a fabricated one', async () => {
    const { service, comment } = await withComment();
    const first = await service.reportComment('o1', comment.id, staff, 'first');
    const second = await service.reportComment('o1', comment.id, staff, 'second');
    expect(second.id).toBe(first.id);
  });

  it('refuses resolution by a learner', async () => {
    const { service, comment } = await withComment();
    await service.reportComment('o1', comment.id, staff, 'a');
    await expect(service.resolveReports('o1', comment.id, learner)).rejects.toThrow(ForbiddenError);
  });
});

describe('listComments', () => {
  /** One pending and one published comment, on activities a1 and a2. */
  async function seeded() {
    const ctx = makeService();
    await enabled(ctx.service, { requireReview: true });
    const pending = await ctx.service.postComment('o1', learner, {
      activityId: 'a1',
      parentId: null,
      body: 'needs review',
    });
    const published = await ctx.service.postComment('o1', staff, {
      activityId: 'a2',
      parentId: null,
      body: 'from a moderator',
    });
    return { ...ctx, pending, published };
  }

  it('lists every comment in the org when nothing is filtered', async () => {
    const { service, pending, published } = await seeded();
    const page = await service.listComments('o1', q());
    expect(page.rows.map((r) => r.id).sort()).toEqual([pending.id, published.id].sort());
    expect(page.total).toBe(2);
  });

  it('filters by status', async () => {
    const { service, pending } = await seeded();
    const page = await service.listComments('o1', q({ status: 'pending' }));
    expect(page.rows.map((r) => r.id)).toEqual([pending.id]);
  });

  it('filters by course, resolved through the activity', async () => {
    const { service } = await seeded();
    expect((await service.listComments('o1', q({ courseId: 'c1' }))).total).toBe(2);
    expect((await service.listComments('o1', q({ courseId: 'c2' }))).total).toBe(0);
  });

  it('filters by activity', async () => {
    const { service, pending } = await seeded();
    const page = await service.listComments('o1', q({ activityId: 'a1' }));
    expect(page.rows.map((r) => r.id)).toEqual([pending.id]);
  });

  it('filters by author', async () => {
    const { service, pending } = await seeded();
    const page = await service.listComments('o1', q({ orgUserId: learner.orgUserId }));
    expect(page.rows.map((r) => r.id)).toEqual([pending.id]);
  });

  it('searches the body', async () => {
    const { service, published } = await seeded();
    const page = await service.listComments('o1', q({ search: 'moderator' }));
    expect(page.rows.map((r) => r.id)).toEqual([published.id]);
  });

  it('separates reported from unreported', async () => {
    const { service, published } = await seeded();
    await service.reportComment('o1', published.id, learner, 'spam');
    expect((await service.listComments('o1', q({ reported: true }))).rows.map((r) => r.id)).toEqual([
      published.id,
    ]);
    expect((await service.listComments('o1', q({ reported: false }))).total).toBe(1);
  });

  it('combines filters rather than replacing one with another', async () => {
    const { service } = await seeded();
    const page = await service.listComments('o1', q({ status: 'pending', activityId: 'a2' }));
    expect(page.rows).toHaveLength(0);
  });

  it('pages, reporting the unpaged total', async () => {
    const { service } = await seeded();
    const page = await service.listComments('o1', q({ page: 1, pageSize: 1 }));
    expect(page.rows).toHaveLength(1);
    expect(page.total).toBe(2);
    expect(page.pageSize).toBe(1);
  });

  it('serves a removed comment with its body, which a reader is never given', async () => {
    const { service, published } = await seeded();
    await service.remove('o1', published.id, staff);
    const row = (await service.listComments('o1', q({ status: 'removed' }))).rows[0];
    expect(row?.body).toBe('from a moderator');
    expect(row?.removedBy).toBe(staff.orgUserId);
  });

  it('throws NotFoundError rather than serving a blank id/email placeholder', async () => {
    const fake = fakeRepo();
    const { service } = makeService(fake);
    await enabled(service, { requireReview: true });
    await service.postComment('o1', learner, { activityId: 'a1', parentId: null, body: 'q' });
    fake.repo.authorsOf = async () => ({});
    await expect(service.listComments('o1', q())).rejects.toThrow(NotFoundError);
  });
});
