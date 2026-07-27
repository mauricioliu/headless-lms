// discussion context — service implementation (inbound port).
//
// Owns every discussion rule: which settings apply to a thread, whether a new
// comment lands pending, who may edit/remove/moderate, and what a given reader
// is served. The caller's staff standing arrives as an `Actor` resolved at the
// HTTP edge — core never looks a role up to make a decision. Profiles and roles
// ARE read back to render an author, which is presentation, not authorisation.
//
// A comment stores no course. Every path that needs one resolves it from the
// activity through the repository.
import { genId } from '../shared/id.js';
import { NotFoundError, ForbiddenError } from '../shared/errors.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type {
  Comment,
  CommentAuthor,
  CommentReport,
  DiscussionSettings,
  ThreadState,
} from './model.js';
import type { PostCommentInput, ResolvedThreadConfig, ThreadComment } from './types.js';
import type {
  Actor,
  AuthorRecord,
  DiscussionRepository,
  DiscussionService,
  DiscussionUnitOfWork,
  QueueEntry,
  QueueQuery,
  ThreadView,
} from './ports.js';

/** A course with no stored settings. Discussion is opt-in, so the common case
 *  persists no row at all and every existing course stays silent. */
export const DEFAULT_SETTINGS = {
  enabled: false,
  threaded: true,
  requireReview: false,
  reactions: true,
} as const;

export class DiscussionServiceImpl implements DiscussionService {
  constructor(
    private readonly repo: DiscussionRepository,
    private readonly uow: DiscussionUnitOfWork,
    private readonly now: () => string,
    private readonly logger: Logger = noopLogger,
  ) {}

  async getSettings(orgId: string, courseId: string): Promise<DiscussionSettings> {
    const stored = await this.repo.findSettings(orgId, courseId);
    return stored ?? { orgId, courseId, ...DEFAULT_SETTINGS };
  }

  async setSettings(
    orgId: string,
    courseId: string,
    patch: Partial<Omit<DiscussionSettings, 'orgId' | 'courseId'>>,
  ): Promise<DiscussionSettings> {
    const current = await this.getSettings(orgId, courseId);
    return this.repo.upsertSettings(orgId, { ...current, ...patch });
  }

  async setThreadState(
    orgId: string,
    activityId: string,
    state: ThreadState | null,
  ): Promise<void> {
    if (state === null) {
      await this.repo.clearThreadState(orgId, activityId);
      return;
    }
    await this.repo.upsertThreadState(orgId, activityId, state);
  }

  listThreadStates(orgId: string, courseId: string): Promise<Record<string, ThreadState>> {
    return this.repo.listThreadStatesByCourse(orgId, courseId);
  }

  /** The course an activity sits in. Content owns this fact; discussion reads
   *  it here rather than storing a copy that goes stale on a restructure. */
  private async courseOf(orgId: string, activityId: string): Promise<string> {
    const courseId = await this.repo.courseOfActivity(orgId, activityId);
    if (!courseId) {
      throw new NotFoundError('Activity', activityId);
    }
    return courseId;
  }

  async resolveConfig(orgId: string, activityId: string): Promise<ResolvedThreadConfig> {
    const courseId = await this.courseOf(orgId, activityId);
    const settings = await this.getSettings(orgId, courseId);
    const override = await this.repo.findThreadState(orgId, activityId);
    // Discussion off for the course cannot be overridden back on by an
    // activity: the course switch is the master.
    const state: ThreadState = !settings.enabled ? 'hidden' : (override ?? 'visible');
    return {
      enabled: settings.enabled,
      threaded: settings.threaded,
      requireReview: settings.requireReview,
      reactions: settings.reactions,
      state,
    };
  }

  /** Strip the email a profile row carries — a thread must never expose one. */
  private toAuthor(record: AuthorRecord): CommentAuthor {
    return { id: record.id, name: record.name, image: record.image, role: record.role };
  }

  /** Render one comment with no reaction context. Used by post and edit, where
   *  the caller has just written the row and needs it back in the same shape
   *  the thread serves. */
  private async renderOne(
    orgId: string,
    comment: Comment,
    actor: Actor,
  ): Promise<ThreadComment> {
    const ids = [comment.orgUserId, ...(comment.removedBy ? [comment.removedBy] : [])];
    const records = await this.repo.authorsOf(orgId, [...new Set(ids)]);
    const author = records[comment.orgUserId];
    if (!author) {
      throw new NotFoundError('OrgUser', comment.orgUserId);
    }
    const remover = comment.removedBy ? records[comment.removedBy] : undefined;
    return {
      id: comment.id,
      parentId: comment.parentId,
      author: this.toAuthor(author),
      isOwn: comment.orgUserId === actor.orgUserId,
      body: comment.status === 'removed' ? null : comment.body,
      status: comment.status,
      removedBy: remover ? this.toAuthor(remover) : null,
      reactions: [],
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }

  async post(orgId: string, actor: Actor, input: PostCommentInput): Promise<ThreadComment> {
    const config = await this.resolveConfig(orgId, input.activityId);
    if (config.state !== 'visible') {
      throw new ForbiddenError('discussion is not open on this activity');
    }
    if (input.parentId !== null) {
      if (!config.threaded) {
        throw new ForbiddenError('replies are disabled on this course');
      }
      const parent = await this.repo.findComment(orgId, input.parentId);
      if (!parent || parent.activityId !== input.activityId) {
        throw new NotFoundError('Comment', input.parentId);
      }
      // One level. A reply hangs off a root comment; a reply to a reply would
      // start an indent ladder no reader benefits from.
      if (parent.parentId !== null) {
        throw new ForbiddenError('replies nest one level');
      }
      // A pending comment is not a reply target — a subtree must never hang off
      // something no moderator has approved.
      if (parent.status !== 'published') {
        throw new ForbiddenError('cannot reply to a comment that is not published');
      }
    }
    // Review holds learners only; staff publish immediately. The role is read
    // once at the edge and applied here, never stored on the row.
    const status: Comment['status'] =
      config.requireReview && !actor.isStaff ? 'pending' : 'published';
    const at = this.now();
    const comment: Comment = {
      id: genId('comment'),
      orgId,
      activityId: input.activityId,
      parentId: input.parentId,
      orgUserId: actor.orgUserId,
      body: input.body,
      status,
      removedBy: null,
      createdAt: at,
      updatedAt: at,
    };
    const saved = await this.uow.run(async (scope) => {
      const row = await scope.discussion.insertComment(orgId, comment);
      await scope.outbox.append([{ type: 'comment.created', orgId, comment: row }]);
      this.logger.info('comment created', { orgId, commentId: row.id, status });
      return row;
    });
    return this.renderOne(orgId, saved, actor);
  }

  async listThread(orgId: string, activityId: string, actor: Actor): Promise<ThreadView> {
    const config = await this.resolveConfig(orgId, activityId);
    if (config.state === 'hidden') {
      return { config, comments: [] };
    }
    const rows = await this.repo.listByActivity(orgId, activityId);
    // A pending comment is visible to its own author and to staff, nobody else.
    const readable = rows.filter((c) => {
      if (c.status === 'published' || c.status === 'removed') {
        return true;
      }
      return actor.isStaff || c.orgUserId === actor.orgUserId;
    });
    // Replies nest one level, so a reply has nothing hanging off it — a removed
    // reply is simply dropped rather than held open as a placeholder.
    const replies = readable.filter((c) => c.parentId !== null && c.status !== 'removed');
    const heldOpen = new Set(replies.map((r) => r.parentId));
    // A removed root survives only to hold replies THIS reader can see. Judging
    // it against every reply would show a marker with nothing beneath it.
    const roots = readable.filter(
      (c) => c.parentId === null && (c.status !== 'removed' || heldOpen.has(c.id)),
    );
    const rootIds = new Set(roots.map((r) => r.id));
    const served = [...roots, ...replies.filter((r) => rootIds.has(r.parentId!))].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );

    const ids = served.map((c) => c.id);
    const people = new Set<string>();
    for (const c of served) {
      people.add(c.orgUserId);
      if (c.removedBy) {
        people.add(c.removedBy);
      }
    }
    const [reactions, authors] = await Promise.all([
      config.reactions ? this.repo.listReactions(orgId, ids) : Promise.resolve([]),
      this.repo.authorsOf(orgId, [...people]),
    ]);

    const comments = served.map((c) => {
      const own = reactions.filter((r) => r.commentId === c.id);
      const byEmoji = new Map<string, { emoji: string; count: number; reacted: boolean }>();
      for (const r of own) {
        const entry = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, reacted: false };
        entry.count += 1;
        entry.reacted ||= r.orgUserId === actor.orgUserId;
        byEmoji.set(r.emoji, entry);
      }
      const author = authors[c.orgUserId];
      const remover = c.removedBy ? authors[c.removedBy] : undefined;
      return {
        id: c.id,
        parentId: c.parentId,
        author: author
          ? this.toAuthor(author)
          : { id: c.orgUserId, name: 'Unknown', image: null, role: 'student' as const },
        isOwn: c.orgUserId === actor.orgUserId,
        body: c.status === 'removed' ? null : c.body,
        status: c.status,
        removedBy: remover ? this.toAuthor(remover) : null,
        reactions: [...byEmoji.values()].sort((a, b) => a.emoji.localeCompare(b.emoji)),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });
    return { config, comments };
  }

  private async load(orgId: string, commentId: string): Promise<Comment> {
    const comment = await this.repo.findComment(orgId, commentId);
    if (!comment) {
      throw new NotFoundError('Comment', commentId);
    }
    return comment;
  }

  async edit(
    orgId: string,
    commentId: string,
    actor: Actor,
    body: string,
  ): Promise<ThreadComment> {
    const comment = await this.load(orgId, commentId);
    // Editing is the author's alone — moderators remove, they do not rewrite.
    if (comment.orgUserId !== actor.orgUserId) {
      throw new ForbiddenError('only the author may edit a comment');
    }
    if (comment.status === 'removed') {
      throw new ForbiddenError('a removed comment cannot be edited');
    }
    const updated = await this.repo.updateComment(orgId, commentId, {
      body,
      updatedAt: this.now(),
    });
    return this.renderOne(orgId, updated ?? comment, actor);
  }

  async remove(orgId: string, commentId: string, actor: Actor): Promise<Comment> {
    const comment = await this.load(orgId, commentId);
    if (comment.orgUserId !== actor.orgUserId && !actor.isStaff) {
      throw new ForbiddenError('only the author or a moderator may remove a comment');
    }
    if (comment.status === 'removed') {
      return comment;
    }
    return this.uow.run(async (scope) => {
      const updated = await scope.discussion.updateComment(orgId, commentId, {
        status: 'removed',
        removedBy: actor.orgUserId,
        updatedAt: this.now(),
      });
      if (!updated) {
        // load() proved it existed; a null here means it vanished mid-operation.
        // Roll back rather than emit an event for a transition that didn't happen.
        throw new NotFoundError('Comment', commentId);
      }
      await scope.outbox.append([
        { type: 'comment.removed', orgId, comment: updated, removedBy: actor.orgUserId },
      ]);
      this.logger.info('comment removed', { orgId, commentId, by: actor.orgUserId });
      return updated;
    });
  }

  async restore(orgId: string, commentId: string, actor: Actor): Promise<Comment> {
    if (!actor.isStaff) {
      throw new ForbiddenError('only a moderator may restore a comment');
    }
    const comment = await this.load(orgId, commentId);
    if (comment.status !== 'removed') {
      return comment;
    }
    const updated = await this.repo.updateComment(orgId, commentId, {
      status: 'published',
      removedBy: null,
      updatedAt: this.now(),
    });
    return updated ?? comment;
  }

  /** Load a comment together with its thread's resolved config. Both gates
   *  below need the pair, and neither should read the row twice. */
  private async loadWithConfig(
    orgId: string,
    commentId: string,
  ): Promise<{ comment: Comment; config: ResolvedThreadConfig }> {
    const comment = await this.load(orgId, commentId);
    const config = await this.resolveConfig(orgId, comment.activityId);
    return { comment, config };
  }

  async react(orgId: string, commentId: string, actor: Actor, emoji: string): Promise<void> {
    const { config } = await this.loadWithConfig(orgId, commentId);
    // Writing to the thread — locked and hidden both refuse.
    if (config.state !== 'visible') {
      throw new ForbiddenError('discussion is not open on this activity');
    }
    if (!config.reactions) {
      throw new ForbiddenError('reactions are disabled on this course');
    }
    await this.repo.insertReaction(orgId, {
      orgId,
      commentId,
      orgUserId: actor.orgUserId,
      emoji,
      createdAt: this.now(),
    });
  }

  async unreact(orgId: string, commentId: string, actor: Actor, emoji: string): Promise<void> {
    const { config } = await this.loadWithConfig(orgId, commentId);
    if (config.state !== 'visible') {
      throw new ForbiddenError('discussion is not open on this activity');
    }
    await this.repo.deleteReaction(orgId, commentId, actor.orgUserId, emoji);
  }

  async approve(orgId: string, commentId: string, actor: Actor): Promise<Comment> {
    if (!actor.isStaff) {
      throw new ForbiddenError('only a moderator may approve a comment');
    }
    const comment = await this.load(orgId, commentId);
    if (comment.status !== 'pending') {
      throw new ForbiddenError('only a pending comment can be approved');
    }
    return this.uow.run(async (scope) => {
      const updated = await scope.discussion.updateComment(orgId, commentId, {
        status: 'published',
        updatedAt: this.now(),
      });
      if (!updated) {
        // load() proved it existed; a null here means it vanished mid-operation.
        // Roll back rather than emit an event for a transition that didn't happen.
        throw new NotFoundError('Comment', commentId);
      }
      await scope.outbox.append([{ type: 'comment.published', orgId, comment: updated }]);
      this.logger.info('comment published', { orgId, commentId });
      return updated;
    });
  }

  async report(
    orgId: string,
    commentId: string,
    actor: Actor,
    reason: string,
  ): Promise<CommentReport> {
    const { config } = await this.loadWithConfig(orgId, commentId);
    // Locked accepts reports — an archived thread can still hold something a
    // moderator needs to see. Hidden does not: nothing in it is being served,
    // so nobody is looking at a comment to flag.
    if (config.state === 'hidden') {
      throw new ForbiddenError('discussion is not open on this activity');
    }
    const report: CommentReport = {
      id: genId('commentReport'),
      orgId,
      commentId,
      orgUserId: actor.orgUserId,
      reason,
      resolvedAt: null,
      createdAt: this.now(),
    };
    return this.uow.run(async (scope) => {
      const saved = await scope.discussion.insertReport(orgId, report);
      if (!saved) {
        // Already reported by this person — the existing open report stands and
        // a second event would double-count any threshold automation.
        return report;
      }
      await scope.outbox.append([{ type: 'comment.reported', orgId, report: saved }]);
      this.logger.info('comment reported', { orgId, commentId });
      return saved;
    });
  }

  async resolveReports(orgId: string, commentId: string, actor: Actor): Promise<void> {
    if (!actor.isStaff) {
      throw new ForbiddenError('only a moderator may resolve a report');
    }
    await this.load(orgId, commentId);
    await this.repo.resolveReportsFor(orgId, commentId, this.now());
  }

  async queue(orgId: string, query: QueueQuery): Promise<QueueEntry[]> {
    const rows =
      query.kind === 'pending'
        ? await this.repo.listByStatusWithContext(orgId, 'pending', query.courseId)
        : await this.repo.listReportedWithContext(orgId, query.courseId);
    if (rows.length === 0) {
      return [];
    }
    const commentIds = rows.map((r) => r.comment.id);
    const reports = await this.repo.listOpenReports(orgId, commentIds);
    // One lookup covers both the comment authors and everyone who flagged them.
    const people = new Set<string>();
    for (const r of rows) {
      people.add(r.comment.orgUserId);
    }
    for (const r of reports) {
      people.add(r.orgUserId);
    }
    const authors = await this.repo.authorsOf(orgId, [...people]);
    const unknown = { id: '', name: 'Unknown', image: null, role: 'student' as const, email: '' };

    return rows.map(({ comment, courseId, activityTitle }) => {
      const record = authors[comment.orgUserId] ?? { ...unknown, id: comment.orgUserId };
      return {
        comment,
        author: this.toAuthor(record),
        authorEmail: record.email,
        courseId,
        activityTitle,
        reports: reports
          .filter((r) => r.commentId === comment.id)
          .map((r) => ({
            reporter: this.toAuthor(authors[r.orgUserId] ?? { ...unknown, id: r.orgUserId }),
            reason: r.reason,
            createdAt: r.createdAt,
          })),
      };
    });
  }
}
