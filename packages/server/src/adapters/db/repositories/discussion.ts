// discussion — Drizzle repository (implements the core outbound port).
//
// Two facts discussion does not own are resolved here rather than stored:
//   - the author's profile and current role, via the shared display join
//   - the course an activity sits in, via its module
// Both change independently of a comment, so a stored copy would go stale.
import { and, asc, desc, eq, ilike, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  AuthorRecord,
  DiscussionRepository,
} from '../../../core/discussion/ports.js';
import type { Comment, CommentReaction, CommentReport } from '@headless-lms/types';
import type { ListCommentsQuery, Page } from '@headless-lms/types';
import { commentReactions, commentReports, comments } from '../schema/index.js';
import { activities } from '../schema/content.js';
import { orgUsers } from '../schema/index.js';
import { users } from '../schema/identity.js';
import { user } from '../../auth/schema.js';
import { orgUserProfileColumns } from './org-user-profile.js';
import type { Logger } from '@headless-lms/types';
import { noopLogger } from '../../../core/shared/logger.js';

type CommentRow = typeof comments.$inferSelect;

/** The title lives in the activity's opaque settings blob; the moderation card
 *  needs it to say "Lesson 3" rather than an id. */
const activityTitleExpr = sql<string>`coalesce(${activities.settings} ->> 'title', '')`;

/** Sortable columns of the staff comment list, by the client-facing field name.
 *  `activityTitle` sorts on the same expression the row is served from. */
const sortColumns = {
  createdAt: comments.createdAt,
  updatedAt: comments.updatedAt,
  status: comments.status,
  activityTitle: activityTitleExpr,
} as const;

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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toReaction(row: typeof commentReactions.$inferSelect): CommentReaction {
  return {
    orgId: row.orgId,
    commentId: row.commentId,
    orgUserId: row.orgUserId,
    emoji: row.emoji,
    createdAt: row.createdAt.toISOString(),
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
    return rows.map(toReaction);
  }

  async insertReaction(
    orgId: string,
    reaction: Omit<CommentReaction, 'createdAt'>,
  ): Promise<CommentReaction> {
    // `createdAt` is the column default, so the stored row is the only place it
    // exists. The conflict branch sets the emoji it already holds — a no-op
    // whose only job is to make RETURNING hand back the existing row.
    const [row] = await this.db
      .insert(commentReactions)
      .values({
        orgId,
        commentId: reaction.commentId,
        orgUserId: reaction.orgUserId,
        emoji: reaction.emoji,
      })
      .onConflictDoUpdate({
        target: [
          commentReactions.orgId,
          commentReactions.commentId,
          commentReactions.orgUserId,
          commentReactions.emoji,
        ],
        set: { emoji: reaction.emoji },
      })
      .returning();
    return toReaction(row!);
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

  /** The list's one join: comments to their activity, which carries both the
   *  course (denormalised, so the module never enters the query) and the title.
   *  The course filter and the row's activity title come out of that same pass,
   *  so neither costs an extra query. */
  private listRows(where: SQL | undefined) {
    return this.db
      .select({
        comment: comments,
        courseId: activities.courseId,
        activityTitle: activityTitleExpr,
      })
      .from(comments)
      .innerJoin(
        activities,
        and(eq(activities.orgId, comments.orgId), eq(activities.id, comments.activityId)),
      )
      .where(where);
  }

  /** The same join and filters, counted. Separate from `listRows` because the
   *  total must ignore limit/offset. */
  private listTotal(where: SQL | undefined) {
    return this.db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(comments)
      .innerJoin(
        activities,
        and(eq(activities.orgId, comments.orgId), eq(activities.id, comments.activityId)),
      )
      .where(where);
  }

  async listComments(orgId: string, query: ListCommentsQuery): Promise<Page<Comment>> {
    const conditions: SQL[] = [eq(comments.orgId, orgId)];
    if (query.status) {
      conditions.push(eq(comments.status, query.status));
    }
    if (query.courseId) {
      conditions.push(eq(activities.courseId, query.courseId));
    }
    if (query.activityId) {
      conditions.push(eq(comments.activityId, query.activityId));
    }
    if (query.orgUserId) {
      conditions.push(eq(comments.orgUserId, query.orgUserId));
    }
    if (query.reported !== undefined) {
      // Correlated EXISTS rather than a join to comment_reports: a comment with
      // three open reports must stay one row.
      const hasOpenReport = sql`exists (
        select 1 from ${commentReports} r
        where r.org_id = ${comments.orgId}
          and r.comment_id = ${comments.id}
          and r.resolved_at is null
      )`;
      conditions.push(query.reported ? hasOpenReport : sql`not ${hasOpenReport}`);
    }
    if (query.search) {
      conditions.push(ilike(comments.body, `%${query.search}%`));
    }
    const where = and(...conditions);

    // Sort: `-field` for descending; default to newest first, which is the
    // order a moderator works in.
    let orderBy: SQL;
    if (query.sort) {
      const isDesc = query.sort.startsWith('-');
      const field = (isDesc ? query.sort.slice(1) : query.sort) as keyof typeof sortColumns;
      const col = sortColumns[field] ?? comments.createdAt;
      orderBy = isDesc ? desc(col) : asc(col);
    } else {
      orderBy = desc(comments.createdAt);
    }

    const rows = await this.listRows(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [{ total } = { total: 0 }] = await this.listTotal(where);

    return {
      rows: rows.map((r) => toComment(r.comment)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
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
