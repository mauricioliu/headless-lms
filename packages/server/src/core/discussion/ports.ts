// discussion context — ports.
// Inbound: the use cases the service implements.
// Outbound: the persistence contract the repository fulfils.
import type { Activity, Role } from '@headless-lms/types';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type { Comment, CommentAuthor, CommentReaction, CommentReport } from './model.js';
import type { CommentsConfig, CommentListItem, ListCommentsQuery, Page } from './types.js';

/** An activity's comments as this reader may see them, with the config that
 *  decided it. Domain rows — who wrote them and what they carry is the
 *  caller's to resolve. */
export interface ActivityComments {
  config: CommentsConfig;
  comments: Comment[];
}

/**
 * Who is acting, and the role they hold in this org right now.
 *
 * The role is resolved at the HTTP edge from the session's active-org
 * org user and handed in — read fresh on every request, never stored on a
 * comment. Core does not look a role up to authorise.
 */
export interface Actor {
  id: string;
  role: Role;
}
export type PostCommentInput = {
  actor: Actor;
  activityId: string;
  parentId: string | null;
  body: string;
};

/** A profile row as the repository loads it. `email` is stripped before
 *  comments are served and kept only for the staff comment list. */
export interface AuthorRecord extends CommentAuthor {
  email: string;
}

export interface DiscussionService {
  /** Post a root comment or a reply. Lands pending where review is required and
   *  the poster is not staff. */
  postComment(orgId: string, input: PostCommentInput): Promise<Comment>;
  /** Author-only. Throws ForbiddenError for anyone else, staff included. */
  edit(orgId: string, commentId: string, actor: Actor, body: string): Promise<Comment>;
  /** The author, or anyone whose role is staff. */
  remove(orgId: string, commentId: string, actor: Actor): Promise<Comment>;
  /** Staff only. Returns the comment to published. */
  restore(orgId: string, commentId: string, actor: Actor): Promise<Comment>;
  /** Staff only. Publishes a pending comment. */
  approve(orgId: string, commentId: string, actor: Actor): Promise<Comment>;
  /** Make a comment published, whichever state it is in. Staff only. */
  publish(orgId: string, commentId: string, actor: Actor): Promise<Comment>;

  /** The activity's comments as this reader may see them. */
  activityComments(orgId: string, activityId: string, actor: Actor): Promise<ActivityComments>;

  /**
   * The org's comments, filtered. Staff-scoped: rows carry the author's email
   * and a removed comment's body, neither of which a learner may see, so the
   * edge admits only staff.
   *
   * No rule is applied beyond the filters — this is what exists, not what
   * someone is allowed to read.
   */
  listComments(orgId: string, query: ListCommentsQuery): Promise<Page<Comment>>;

  /** Plain read: every reaction on the given comments. Ungrouped. */
  listReactions(orgId: string, commentIds: string[]): Promise<CommentReaction[]>;

  createReaction(orgId: string, commentId: string, actor: Actor, emoji: string): Promise<void>;
  removeReaction(orgId: string, commentId: string, actor: Actor, emoji: string): Promise<void>;

  /** Accepted even on locked comments — a locked activity can still hold
   *  something a moderator needs to see. */
  reportComment(
    orgId: string,
    commentId: string,
    actor: Actor,
    reason: string,
  ): Promise<CommentReport>;

  /** Plain read of one comment — no rules applied. */
  getComment(orgId: string, commentId: string): Promise<Comment | null>;
}

export interface CourseAccessReader {
  hasCourseAccess(orgId: string, orgUserId: string, courseId: string): Promise<boolean>;
}

export interface ActivityGetter {
  getActivity(orgId: string, activityId: string): Promise<Activity | null>;
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
  /** Idempotent: reacting again with the same emoji returns the reaction
   *  already stored, keeping its original `createdAt`. */
  insertReaction(
    orgId: string,
    reaction: Omit<CommentReaction, 'createdAt'>,
  ): Promise<CommentReaction>;
  deleteReaction(orgId: string, commentId: string, orgUserId: string, emoji: string): Promise<void>;

  /** Returns null when this person has already reported this comment. */
  insertReport(orgId: string, report: CommentReport): Promise<CommentReport | null>;
  /** Every unresolved report against the given comments. */
  listOpenReports(orgId: string, commentIds: string[]): Promise<CommentReport[]>;

  listComments(orgId: string, query: ListCommentsQuery): Promise<Page<Comment>>;
}

/** Writes that emit events run through this scope so the row and the outbox
 *  entry commit in one transaction. */
export interface DiscussionWriteScope {
  discussion: DiscussionRepository;
  outbox: OutboxAppender;
}
export type DiscussionUnitOfWork = UnitOfWork<DiscussionWriteScope>;
