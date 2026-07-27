// discussion — Drizzle repository (implements the core outbound port).
//
// Two facts discussion does not own are resolved here rather than stored:
//   - the author's profile and current role, via the shared display join
//   - the course an activity sits in, via its module
// Both change independently of a comment, so a stored copy would go stale.
import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  AuthorRecord,
  CommentWithContext,
  DiscussionRepository,
} from '../../../core/discussion/ports.js';
import type {
  Comment,
  CommentReaction,
  CommentReport,
  DiscussionSettings,
  ThreadState,
} from '../../../core/discussion/model.js';
import {
  activityThreadStates,
  commentReactions,
  commentReports,
  comments,
  discussionSettings,
} from '../schema/discussion.js';
import { activities, modules } from '../schema/content.js';
import { orgUsers } from '../schema/organizations.js';
import { users } from '../schema/identity.js';
import { user } from '../../auth/schema.js';
import { orgUserProfileColumns } from './org-user-profile.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

type CommentRow = typeof comments.$inferSelect;

/** The title lives in the activity's opaque settings blob; the moderation card
 *  needs it to say "Lesson 3" rather than an id. */
const activityTitleExpr = sql<string>`coalesce(${activities.settings} ->> 'title', '')`;

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    orgId: row.orgId,
    activityId: row.activityId,
    parentId: row.parentId ?? null,
    orgUserId: row.orgUserId,
    body: row.body,
    status: row.status,
    removedBy: row.removedBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toReport(row: typeof commentReports.$inferSelect): CommentReport {
  return {
    id: row.id,
    orgId: row.orgId,
    commentId: row.commentId,
    orgUserId: row.orgUserId,
    reason: row.reason,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DrizzleDiscussionRepository implements DiscussionRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async insertComment(orgId: string, comment: Comment): Promise<Comment> {
    const [row] = await this.db
      .insert(comments)
      .values({
        id: comment.id,
        orgId,
        activityId: comment.activityId,
        parentId: comment.parentId,
        orgUserId: comment.orgUserId,
        body: comment.body,
        status: comment.status,
        removedBy: comment.removedBy,
        createdAt: new Date(comment.createdAt),
        updatedAt: new Date(comment.updatedAt),
      })
      .returning();
    return toComment(row!);
  }

  async findComment(orgId: string, id: string): Promise<Comment | null> {
    const [row] = await this.db
      .select()
      .from(comments)
      .where(and(eq(comments.orgId, orgId), eq(comments.id, id)))
      .limit(1);
    return row ? toComment(row) : null;
  }

  async updateComment(
    orgId: string,
    id: string,
    patch: Partial<Pick<Comment, 'body' | 'status' | 'removedBy' | 'updatedAt'>>,
  ): Promise<Comment | null> {
    const [row] = await this.db
      .update(comments)
      .set({
        ...('body' in patch ? { body: patch.body } : {}),
        ...('status' in patch ? { status: patch.status } : {}),
        ...('removedBy' in patch ? { removedBy: patch.removedBy ?? null } : {}),
        ...('updatedAt' in patch && patch.updatedAt
          ? { updatedAt: new Date(patch.updatedAt) }
          : {}),
      })
      .where(and(eq(comments.orgId, orgId), eq(comments.id, id)))
      .returning();
    return row ? toComment(row) : null;
  }

  async listByActivity(orgId: string, activityId: string): Promise<Comment[]> {
    const rows = await this.db
      .select()
      .from(comments)
      .where(and(eq(comments.orgId, orgId), eq(comments.activityId, activityId)))
      .orderBy(comments.createdAt);
    return rows.map(toComment);
  }

  async listReactions(orgId: string, commentIds: string[]): Promise<CommentReaction[]> {
    if (commentIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(commentReactions)
      .where(
        and(eq(commentReactions.orgId, orgId), inArray(commentReactions.commentId, commentIds)),
      );
    return rows.map((r) => ({
      orgId: r.orgId,
      commentId: r.commentId,
      orgUserId: r.orgUserId,
      emoji: r.emoji,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async insertReaction(orgId: string, reaction: CommentReaction): Promise<void> {
    await this.db
      .insert(commentReactions)
      .values({
        orgId,
        commentId: reaction.commentId,
        orgUserId: reaction.orgUserId,
        emoji: reaction.emoji,
        createdAt: new Date(reaction.createdAt),
      })
      .onConflictDoNothing();
  }

  async deleteReaction(
    orgId: string,
    commentId: string,
    orgUserId: string,
    emoji: string,
  ): Promise<void> {
    await this.db
      .delete(commentReactions)
      .where(
        and(
          eq(commentReactions.orgId, orgId),
          eq(commentReactions.commentId, commentId),
          eq(commentReactions.orgUserId, orgUserId),
          eq(commentReactions.emoji, emoji),
        ),
      );
  }

  async insertReport(orgId: string, report: CommentReport): Promise<CommentReport | null> {
    const [row] = await this.db
      .insert(commentReports)
      .values({
        id: report.id,
        orgId,
        commentId: report.commentId,
        orgUserId: report.orgUserId,
        reason: report.reason,
        resolvedAt: report.resolvedAt ? new Date(report.resolvedAt) : null,
        createdAt: new Date(report.createdAt),
      })
      .onConflictDoNothing()
      .returning();
    return row ? toReport(row) : null;
  }

  async listOpenReports(orgId: string, commentIds: string[]): Promise<CommentReport[]> {
    if (commentIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(commentReports)
      .where(
        and(
          eq(commentReports.orgId, orgId),
          inArray(commentReports.commentId, commentIds),
          isNull(commentReports.resolvedAt),
        ),
      )
      .orderBy(commentReports.createdAt);
    return rows.map(toReport);
  }

  async resolveReportsFor(orgId: string, commentId: string, resolvedAt: string): Promise<void> {
    await this.db
      .update(commentReports)
      .set({ resolvedAt: new Date(resolvedAt) })
      .where(
        and(
          eq(commentReports.orgId, orgId),
          eq(commentReports.commentId, commentId),
          isNull(commentReports.resolvedAt),
        ),
      );
  }

  async findSettings(orgId: string, courseId: string): Promise<DiscussionSettings | null> {
    const [row] = await this.db
      .select()
      .from(discussionSettings)
      .where(and(eq(discussionSettings.orgId, orgId), eq(discussionSettings.courseId, courseId)))
      .limit(1);
    return row ?? null;
  }

  async upsertSettings(orgId: string, settings: DiscussionSettings): Promise<DiscussionSettings> {
    const [row] = await this.db
      .insert(discussionSettings)
      .values({
        orgId,
        courseId: settings.courseId,
        enabled: settings.enabled,
        threaded: settings.threaded,
        requireReview: settings.requireReview,
        reactions: settings.reactions,
      })
      .onConflictDoUpdate({
        target: [discussionSettings.orgId, discussionSettings.courseId],
        set: {
          enabled: settings.enabled,
          threaded: settings.threaded,
          requireReview: settings.requireReview,
          reactions: settings.reactions,
        },
      })
      .returning();
    return row!;
  }

  async findThreadState(orgId: string, activityId: string): Promise<ThreadState | null> {
    const [row] = await this.db
      .select()
      .from(activityThreadStates)
      .where(
        and(
          eq(activityThreadStates.orgId, orgId),
          eq(activityThreadStates.activityId, activityId),
        ),
      )
      .limit(1);
    return row?.state ?? null;
  }

  async listThreadStatesByCourse(
    orgId: string,
    courseId: string,
  ): Promise<Record<string, ThreadState>> {
    const rows = await this.db
      .select({ activityId: activityThreadStates.activityId, state: activityThreadStates.state })
      .from(activityThreadStates)
      .innerJoin(
        activities,
        and(
          eq(activities.orgId, activityThreadStates.orgId),
          eq(activities.id, activityThreadStates.activityId),
        ),
      )
      .innerJoin(
        modules,
        and(eq(modules.orgId, activities.orgId), eq(modules.id, activities.moduleId)),
      )
      .where(and(eq(activityThreadStates.orgId, orgId), eq(modules.courseId, courseId)));
    return Object.fromEntries(rows.map((r) => [r.activityId, r.state]));
  }

  async upsertThreadState(orgId: string, activityId: string, state: ThreadState): Promise<void> {
    await this.db
      .insert(activityThreadStates)
      .values({ orgId, activityId, state })
      .onConflictDoUpdate({
        target: [activityThreadStates.orgId, activityThreadStates.activityId],
        set: { state },
      });
  }

  async clearThreadState(orgId: string, activityId: string): Promise<void> {
    await this.db
      .delete(activityThreadStates)
      .where(
        and(
          eq(activityThreadStates.orgId, orgId),
          eq(activityThreadStates.activityId, activityId),
        ),
      );
  }

  async courseOfActivity(orgId: string, activityId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ courseId: modules.courseId })
      .from(activities)
      .innerJoin(
        modules,
        and(eq(modules.orgId, activities.orgId), eq(modules.id, activities.moduleId)),
      )
      .where(and(eq(activities.orgId, orgId), eq(activities.id, activityId)))
      .limit(1);
    return row?.courseId ?? null;
  }

  /** The queue's one join: comments to their activity to its module, which is
   *  where the course lives. Scoping and the card's activity title come from
   *  the same pass. `filters` always carries the org scope; the course filter
   *  is appended only when the caller narrows to one course. */
  private async withContext(filters: SQL[], courseId?: string): Promise<CommentWithContext[]> {
    if (courseId) {
      filters.push(eq(modules.courseId, courseId));
    }
    const rows = await this.db
      .select({
        comment: comments,
        courseId: modules.courseId,
        activityTitle: activityTitleExpr,
      })
      .from(comments)
      .innerJoin(
        activities,
        and(eq(activities.orgId, comments.orgId), eq(activities.id, comments.activityId)),
      )
      .innerJoin(
        modules,
        and(eq(modules.orgId, activities.orgId), eq(modules.id, activities.moduleId)),
      )
      .where(and(...filters))
      .orderBy(comments.createdAt);
    return rows.map((r) => ({
      comment: toComment(r.comment),
      courseId: r.courseId,
      activityTitle: r.activityTitle,
    }));
  }

  listByStatusWithContext(
    orgId: string,
    status: Comment['status'],
    courseId?: string,
  ): Promise<CommentWithContext[]> {
    return this.withContext(
      [eq(comments.orgId, orgId), eq(comments.status, status)],
      courseId,
    );
  }

  listReportedWithContext(orgId: string, courseId?: string): Promise<CommentWithContext[]> {
    return this.withContext(
      [
        eq(comments.orgId, orgId),
        sql`exists (
          select 1 from ${commentReports} r
          where r.org_id = ${comments.orgId}
            and r.comment_id = ${comments.id}
            and r.resolved_at is null
        )`,
      ],
      courseId,
    );
  }

  async authorsOf(orgId: string, orgUserIds: string[]): Promise<Record<string, AuthorRecord>> {
    if (orgUserIds.length === 0) {
      return {};
    }
    // The shared display join (Task 2): name/email live on org_users, the
    // avatar on the auth engine's mirrored `user` table, reached through
    // identity `users`. Both joins are LEFT — user_id is null until an
    // invitation is accepted. Inlined per-repository (see org-user-profile.ts)
    // rather than through a generic helper, matching members.ts/students.ts.
    const rows = await this.db
      .select({ ...orgUserProfileColumns, role: orgUsers.role })
      .from(orgUsers)
      .leftJoin(users, eq(users.id, orgUsers.userId))
      .leftJoin(user, eq(user.id, users.externalId))
      .where(and(eq(orgUsers.orgId, orgId), inArray(orgUsers.id, orgUserIds)));
    return Object.fromEntries(
      rows.map((r) => [
        r.id,
        { id: r.id, name: r.name, image: r.image ?? null, role: r.role, email: r.email },
      ]),
    );
  }
}
