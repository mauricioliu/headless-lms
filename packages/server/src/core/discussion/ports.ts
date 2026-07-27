// discussion context — ports.
// Inbound: the use cases the service implements.
// Outbound: the persistence contract the repository fulfils.
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type {
  Comment,
  CommentAuthor,
  CommentReaction,
  CommentReport,
  DiscussionSettings,
  ThreadState,
} from './model.js';
import type { PostCommentInput, ResolvedThreadConfig, ThreadComment } from './types.js';

/** Everything a reader needs to render one activity's thread. */
export interface ThreadView {
  config: ResolvedThreadConfig;
  comments: ThreadComment[];
}

/** One entry in a moderator's work queue. Carries what the decision needs:
 *  who wrote it, where it sits, and — for a reported comment — who flagged it
 *  and why. A bare count is not something a moderator can act on. */
export interface QueueEntry {
  comment: Comment;
  author: CommentAuthor;
  /** Present only here. The queue is staff-scoped, and identifying a spam
   *  account is the decision being asked for. Never on a ThreadComment. */
  authorEmail: string;
  /** Resolved from content at read time, never stored. */
  courseId: string;
  activityTitle: string;
  reports: { reporter: CommentAuthor; reason: string; createdAt: string }[];
}

export interface QueueQuery {
  /** Scope to one course; omitted = the whole org. Resolved through the
   *  activity's module, since a comment stores no course. */
  courseId?: string;
  /** "pending" = awaiting review; "reported" = carrying unresolved reports. */
  kind: 'pending' | 'reported';
}

/**
 * Who is acting, and whether they hold staff standing in this org.
 *
 * `isStaff` is resolved at the HTTP edge from the session's active-org role and
 * handed in — read fresh on every request, never stored on a comment. Core does
 * not look a role up to make an authorisation decision; it reads roles back only
 * to render an author, which is presentation.
 */
export interface Actor {
  orgUserId: string;
  isStaff: boolean;
}

/** A profile row as the repository loads it. `email` is stripped before a
 *  thread is served and kept only for the moderation queue. */
export interface AuthorRecord extends CommentAuthor {
  email: string;
}

/** A comment with the content facts resolved at read time. Never stored. */
export interface CommentWithContext {
  comment: Comment;
  courseId: string;
  activityTitle: string;
}

export interface DiscussionService {
  /** The course's settings, or DEFAULT_SETTINGS when none are stored. */
  getSettings(orgId: string, courseId: string): Promise<DiscussionSettings>;
  setSettings(
    orgId: string,
    courseId: string,
    patch: Partial<Omit<DiscussionSettings, 'orgId' | 'courseId'>>,
  ): Promise<DiscussionSettings>;
  /** null clears the override so the course setting applies again. */
  setThreadState(orgId: string, activityId: string, state: ThreadState | null): Promise<void>;
  /** Every explicit override in a course, keyed by activity id. Activities with
   *  no override are absent — they inherit. */
  listThreadStates(orgId: string, courseId: string): Promise<Record<string, ThreadState>>;
  /** Course settings with the activity's override applied. Resolves the course
   *  from the activity. */
  resolveConfig(orgId: string, activityId: string): Promise<ResolvedThreadConfig>;

  /** Post a root comment or a reply. Lands pending where review is required and
   *  the poster is not staff. */
  post(orgId: string, actor: Actor, input: PostCommentInput): Promise<ThreadComment>;
  /** Author-only. Throws ForbiddenError for anyone else, staff included. */
  edit(orgId: string, commentId: string, actor: Actor, body: string): Promise<ThreadComment>;
  /** The author, or anyone whose role is staff. */
  remove(orgId: string, commentId: string, actor: Actor): Promise<Comment>;
  /** Staff only. Returns the comment to published. */
  restore(orgId: string, commentId: string, actor: Actor): Promise<Comment>;
  /** Staff only. Publishes a pending comment. */
  approve(orgId: string, commentId: string, actor: Actor): Promise<Comment>;

  /** The thread as this reader may see it. */
  listThread(orgId: string, activityId: string, actor: Actor): Promise<ThreadView>;

  react(orgId: string, commentId: string, actor: Actor, emoji: string): Promise<void>;
  unreact(orgId: string, commentId: string, actor: Actor, emoji: string): Promise<void>;

  /** Accepted even on a locked thread — an archived thread can still hold
   *  something a moderator needs to see. */
  report(orgId: string, commentId: string, actor: Actor, reason: string): Promise<CommentReport>;
  /** Staff only. Resolves every open report on the comment at once. */
  resolveReports(orgId: string, commentId: string, actor: Actor): Promise<void>;

  queue(orgId: string, query: QueueQuery): Promise<QueueEntry[]>;

  /** Read-only lookup for the HTTP entitlement gate — no rules applied. */
  findCommentForGate(orgId: string, commentId: string): Promise<Comment | null>;
}

export interface DiscussionRepository {
  insertComment(orgId: string, comment: Comment): Promise<Comment>;
  findComment(orgId: string, id: string): Promise<Comment | null>;
  updateComment(
    orgId: string,
    id: string,
    patch: Partial<Pick<Comment, 'body' | 'status' | 'removedBy' | 'updatedAt'>>,
  ): Promise<Comment | null>;
  /** Every comment on the activity, oldest first, including removed ones. */
  listByActivity(orgId: string, activityId: string): Promise<Comment[]>;

  listReactions(orgId: string, commentIds: string[]): Promise<CommentReaction[]>;
  insertReaction(orgId: string, reaction: CommentReaction): Promise<void>;
  deleteReaction(
    orgId: string,
    commentId: string,
    orgUserId: string,
    emoji: string,
  ): Promise<void>;

  /** Returns null when this person has already reported this comment. */
  insertReport(orgId: string, report: CommentReport): Promise<CommentReport | null>;
  /** Every unresolved report against the given comments. */
  listOpenReports(orgId: string, commentIds: string[]): Promise<CommentReport[]>;
  /** Resolves every open report on one comment. */
  resolveReportsFor(orgId: string, commentId: string, resolvedAt: string): Promise<void>;

  findSettings(orgId: string, courseId: string): Promise<DiscussionSettings | null>;
  upsertSettings(orgId: string, settings: DiscussionSettings): Promise<DiscussionSettings>;
  findThreadState(orgId: string, activityId: string): Promise<ThreadState | null>;
  /** Overrides for every activity in the course, keyed by activity id. */
  listThreadStatesByCourse(orgId: string, courseId: string): Promise<Record<string, ThreadState>>;
  upsertThreadState(orgId: string, activityId: string, state: ThreadState): Promise<void>;
  clearThreadState(orgId: string, activityId: string): Promise<void>;

  /** The course an activity sits in, via its module. null when the activity
   *  does not exist. Content's fact, resolved here rather than copied. */
  courseOfActivity(orgId: string, activityId: string): Promise<string | null>;
  /** Comments in `status`, with their course and activity title resolved.
   *  Scoped to a course when given. */
  listByStatusWithContext(
    orgId: string,
    status: Comment['status'],
    courseId?: string,
  ): Promise<CommentWithContext[]>;
  /** Comments carrying at least one unresolved report, same resolution. */
  listReportedWithContext(orgId: string, courseId?: string): Promise<CommentWithContext[]>;

  /** Profiles and current roles of the given participations, keyed by
   *  org_users.id. One join covers the author badge, the moderation card and
   *  the removal placeholder. */
  authorsOf(orgId: string, orgUserIds: string[]): Promise<Record<string, AuthorRecord>>;
}

/** Writes that emit events run through this scope so the row and the outbox
 *  entry commit in one transaction. */
export interface DiscussionWriteScope {
  discussion: DiscussionRepository;
  outbox: OutboxAppender;
}
export type DiscussionUnitOfWork = UnitOfWork<DiscussionWriteScope>;
