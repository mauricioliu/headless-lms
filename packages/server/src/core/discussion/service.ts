// discussion context — service implementation (inbound port).
//
// Owns every discussion rule: whether a learner may reach an activity's
// comments at all, which settings apply to them, whether a new comment lands
// pending, who may edit/remove/moderate, and what a given reader is served.
// Reach is course access, which entitlements owns and this service asks for
// through `CourseAccessReader` — the edge hands over a caller, not a verdict.
// The caller's staff standing arrives as an `Actor` resolved at the HTTP edge
// — core never looks a role up to make a decision.
// Profiles and roles ARE read back to render an author, which is presentation,
// not authorisation.
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
  CommentSettings,
  CommentsState,
} from './model.js';
import type {
  PostCommentInput,
  CommentsConfig,
  CommentView,
  CommentListItem,
  ListCommentsQuery,
  Page,
} from './types.js';
import { SettingsNamespace, type SettingsService } from '../shared/settings.js';
import type {
  Actor,
  AuthorRecord,
  CourseAccessReader,
  DiscussionRepository,
  DiscussionService,
  DiscussionUnitOfWork,
  ActivityComments,
} from './ports.js';

/** A course with no stored settings. Discussion is opt-in, so the common case
 *  persists no row at all and every existing course stays silent. */
export const DEFAULT_SETTINGS = {
  enabled: false,
  threaded: true,
  requireReview: false,
  reactions: true,
} as const;

/** An activity's stored override, scoped by activity id in the same namespace.
 *  `state` absent or null = no override, so the course setting applies. */
interface StoredCommentsState {
  state?: CommentsState | null;
}

export class DiscussionServiceImpl implements DiscussionService {
  constructor(
    private readonly repo: DiscussionRepository,
    private readonly access: CourseAccessReader,
    private readonly uow: DiscussionUnitOfWork,
    private readonly settings: SettingsService,
    private readonly now: () => string,
    private readonly logger: Logger = noopLogger,
  ) {}

  /** The course an activity sits in. Content owns this fact; discussion reads
   *  it here rather than storing a copy that goes stale on a restructure. */
  private async courseOf(orgId: string, activityId: string): Promise<string> {
    const courseId = await this.repo.courseOfActivity(orgId, activityId);
    if (!courseId) {
      throw new NotFoundError('Activity', activityId);
    }
    return courseId;
  }

  async resolveConfig(orgId: string, activityId: string): Promise<CommentsConfig> {
    const courseId = await this.courseOf(orgId, activityId);
    // Both rows live in the `discussion` namespace: the course's settings under
    // the course id, the activity's override under the activity id. Neither is
    // written for a course that has never been configured, so defaults apply.
    const stored = await this.settings.get<Partial<CommentSettings>>(
      orgId,
      SettingsNamespace.discussion,
      courseId,
    );
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    const override = await this.settings.get<StoredCommentsState>(
      orgId,
      SettingsNamespace.discussion,
      activityId,
    );
    // Discussion off for the course cannot be overridden back on by an
    // activity: the course switch is the master.
    const state: CommentsState = !settings.enabled ? 'hidden' : (override?.state ?? 'visible');
    return {
      enabled: settings.enabled,
      threaded: settings.threaded,
      requireReview: settings.requireReview,
      reactions: settings.reactions,
      state,
    };
  }

  /** Strip the email a profile row carries — comments must never expose one. */
  private toAuthor(record: AuthorRecord): CommentAuthor {
    return { id: record.id, name: record.name, image: record.image, role: record.role };
  }

  /** Any participation that is not a learner moderates. The role arrives from
   *  the edge already resolved; core never looks one up to authorise. */
  private isStaff(actor: Actor): boolean {
    return actor.role !== 'student';
  }

  /** A learner reaches an activity's comments only through active access to the
   *  course it sits in. Staff are not enrolled, so the check does not apply to
   *  them. Denial is a 404, not a 403 — a 403 would confirm the activity exists
   *  to someone who may not know it does. */
  private async requireAccess(orgId: string, activityId: string, actor: Actor): Promise<void> {
    if (this.isStaff(actor)) {
      return;
    }
    const courseId = await this.courseOf(orgId, activityId);
    if (!(await this.access.hasCourseAccess(orgId, actor.orgUserId, courseId))) {
      throw new NotFoundError('Activity', activityId);
    }
  }

  /** Render one comment with no reaction context. Used by post and edit, where
   *  the caller has just written the row and needs it back in the same shape
   *  comments are served. */
  private async renderOne(orgId: string, comment: Comment, actor: Actor): Promise<CommentView> {
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

  async post(orgId: string, actor: Actor, input: PostCommentInput): Promise<CommentView> {
    await this.requireAccess(orgId, input.activityId, actor);
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
      config.requireReview && !this.isStaff(actor) ? 'pending' : 'published';
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

  async activityComments(
    orgId: string,
    activityId: string,
    actor: Actor,
  ): Promise<ActivityComments> {
    await this.requireAccess(orgId, activityId, actor);
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
      return this.isStaff(actor) || c.orgUserId === actor.orgUserId;
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
      if (!author) {
        throw new NotFoundError('OrgUser', c.orgUserId);
      }
      // An ABSENT removedBy is normal — the comment was never removed. A
      // removedBy id that does not resolve means the remover's profile
      // vanished, which must throw rather than render a fake remover.
      if (c.removedBy && !authors[c.removedBy]) {
        throw new NotFoundError('OrgUser', c.removedBy);
      }
      const remover = c.removedBy ? authors[c.removedBy] : undefined;
      return {
        id: c.id,
        parentId: c.parentId,
        author: this.toAuthor(author),
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

  async edit(orgId: string, commentId: string, actor: Actor, body: string): Promise<CommentView> {
    const { comment, config } = await this.loadWithConfig(orgId, commentId, actor);
    if (config.state !== 'visible') {
      throw new ForbiddenError('discussion is not open on this activity');
    }
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
    if (!updated) {
      // getComment() proved it existed; a null here means it vanished mid-write.
      // Returning the pre-edit comment would report success and hand back
      // the old body.
      throw new NotFoundError('Comment', commentId);
    }
    return this.renderOne(orgId, updated, actor);
  }

  async remove(orgId: string, commentId: string, actor: Actor): Promise<Comment> {
    const comment = await this.getComment(orgId, commentId);
    if (!comment) {
      throw new NotFoundError('Comment', commentId);
    }

    await this.requireAccess(orgId, comment.activityId, actor);
    if (comment.orgUserId !== actor.orgUserId && !this.isStaff(actor)) {
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
        // getComment() proved it existed; a null here means it vanished mid-operation.
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
    if (!this.isStaff(actor)) {
      throw new ForbiddenError('only a moderator may restore a comment');
    }
    const comment = await this.getComment(orgId, commentId);
    if (comment.status !== 'removed') {
      return comment;
    }
    const updated = await this.repo.updateComment(orgId, commentId, {
      status: 'published',
      removedBy: null,
      updatedAt: this.now(),
    });
    if (!updated) {
      // getComment() proved it existed; a null here means it vanished mid-write.
      // Returning the still-removed comment would report success while
      // handing back the removed row.
      throw new NotFoundError('Comment', commentId);
    }
    return updated;
  }

  /** Load a comment together with its activity's resolved comments config,
   *  having proved the actor may reach that activity at all. Every path that
   *  acts on one comment needs the pair, and none should read the row twice. */
  private async loadWithConfig(
    orgId: string,
    commentId: string,
    actor: Actor,
  ): Promise<{ comment: Comment; config: CommentsConfig }> {
    const comment = await this.getComment(orgId, commentId);
    if (!comment) {
      throw new NotFoundError('Comment', commentId);
    }
    await this.requireAccess(orgId, comment.activityId, actor);
    const config = await this.resolveConfig(orgId, comment.activityId);
    return { comment, config };
  }

  async react(orgId: string, commentId: string, actor: Actor, emoji: string): Promise<void> {
    const { config } = await this.loadWithConfig(orgId, commentId, actor);
    // Writing to comments — locked and hidden both refuse.
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
    const { config } = await this.loadWithConfig(orgId, commentId, actor);
    if (config.state !== 'visible') {
      throw new ForbiddenError('discussion is not open on this activity');
    }
    await this.repo.deleteReaction(orgId, commentId, actor.orgUserId, emoji);
  }

  async approve(orgId: string, commentId: string, actor: Actor): Promise<Comment> {
    if (!this.isStaff(actor)) {
      throw new ForbiddenError('only a moderator may approve a comment');
    }
    const comment = await this.getComment(orgId, commentId);
    if (!comment) {
      throw new NotFoundError('Comment', commentId);
    }
    if (comment.status !== 'pending') {
      throw new ForbiddenError('only a pending comment can be approved');
    }
    return this.uow.run(async (scope) => {
      const updated = await scope.discussion.updateComment(orgId, commentId, {
        status: 'published',
        updatedAt: this.now(),
      });
      if (!updated) {
        // getComment() proved it existed; a null here means it vanished mid-operation.
        // Roll back rather than emit an event for a transition that didn't happen.
        throw new NotFoundError('Comment', commentId);
      }
      await scope.outbox.append([{ type: 'comment.published', orgId, comment: updated }]);
      this.logger.info('comment published', { orgId, commentId });
      return updated;
    });
  }

  /** Loads the comment and dispatches to whichever transition applies — the
   *  caller must not decide that itself. `approve` and `restore` still enforce
   *  their own staff check; the check here covers the third path, where a
   *  comment is already published and neither of them would run. */
  async publish(orgId: string, commentId: string, actor: Actor): Promise<Comment> {
    if (!this.isStaff(actor)) {
      throw new ForbiddenError('only a moderator may publish a comment');
    }
    const comment = await this.getComment(orgId, commentId);
    if (!comment) {
      throw new NotFoundError('Comment', commentId);
    }

    return this.approve(orgId, commentId, actor);
  }

  async reportComment(
    orgId: string,
    commentId: string,
    actor: Actor,
    reason: string,
  ): Promise<CommentReport> {
    const { config } = await this.loadWithConfig(orgId, commentId, actor);
    // Locked accepts reports — a locked activity can still hold something a
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
        // Already reported by this person. Return the report that actually
        // exists — a fabricated id resolves to nothing — and emit no second
        // event, which would double-count any threshold automation.
        const open = await scope.discussion.listOpenReports(orgId, [commentId]);
        const mine = open.find((r) => r.orgUserId === actor.orgUserId);
        if (mine) {
          return mine;
        }
        return report;
      }
      await scope.outbox.append([{ type: 'comment.reported', orgId, report: saved }]);
      this.logger.info('comment reported', { orgId, commentId });
      return saved;
    });
  }

  async resolveReports(orgId: string, commentId: string, actor: Actor): Promise<void> {
    if (!this.isStaff(actor)) {
      throw new ForbiddenError('only a moderator may resolve a report');
    }
    return this.repo.resolveReportsFor(orgId, commentId, this.now());
  }

  /** The staff comment list. Filtering, ordering and paging are the
   *  repository's; this hydrates the page it gets back — two lookups for the
   *  whole page rather than per row. */
  async listComments(orgId: string, query: ListCommentsQuery): Promise<Page<CommentListItem>> {
    const page = await this.repo.listComments(orgId, query);
    if (page.rows.length === 0) {
      return { ...page, rows: [] };
    }
    const reports = await this.repo.listOpenReports(
      orgId,
      page.rows.map((r) => r.comment.id),
    );
    // One lookup covers both the comment authors and everyone who flagged them.
    const people = new Set<string>();
    for (const r of page.rows) {
      people.add(r.comment.orgUserId);
    }
    for (const r of reports) {
      people.add(r.orgUserId);
    }
    const authors = await this.repo.authorsOf(orgId, [...people]);

    const rows = page.rows.map(({ comment, courseId, activityTitle }) => {
      const record = authors[comment.orgUserId];
      if (!record) {
        // The list's whole purpose is letting a moderator identify an
        // account — a fabricated blank record defeats that.
        throw new NotFoundError('OrgUser', comment.orgUserId);
      }
      return {
        id: comment.id,
        parentId: comment.parentId,
        activityId: comment.activityId,
        activityTitle,
        courseId,
        body: comment.body,
        status: comment.status,
        author: this.toAuthor(record),
        authorEmail: record.email,
        removedBy: comment.removedBy,
        reports: reports
          .filter((r) => r.commentId === comment.id)
          .map((r) => {
            const reporter = authors[r.orgUserId];
            if (!reporter) {
              throw new NotFoundError('OrgUser', r.orgUserId);
            }
            return {
              reporter: this.toAuthor(reporter),
              reason: r.reason,
              createdAt: r.createdAt,
            };
          }),
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      };
    });
    return { ...page, rows };
  }

  getComment(orgId: string, commentId: string): Promise<Comment | null> {
    return this.repo.findComment(orgId, commentId);
  }
}
