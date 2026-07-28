// discussion context — domain entities, DTOs, and events.
//
// A Comment attaches to an activity and optionally replies to another comment.
// The author is an org_users participation; their profile and role are resolved
// at read time and never stored here. A removed comment is retained so its
// replies survive — only its body stops being served.
//
// A comment records NO course. Which course an activity sits in is content's
// fact and changes when a course is restructured, so it is resolved when
// scoping settings or a queue.

import type { DomainEvent } from "./shared.js";
import type { OrgUserProfile, Role } from "./organizations.js";

export type CommentStatus = "pending" | "published" | "removed";

/** Per-activity override of the course's discussion settings. */
export type CommentsState = "visible" | "hidden" | "locked";

export interface Comment {
  readonly id: string;
  readonly orgId: string;
  readonly activityId: string;
  /** null = a root comment. Replies nest one level: a reply's parent is always
   *  a root comment, so this is never the id of another reply. */
  readonly parentId: string | null;
  /** The author's `org_users.id`. */
  readonly orgUserId: string;
  body: string;
  status: CommentStatus;
  /** The `org_users.id` that removed it; null unless status is "removed". */
  removedBy: string | null;
  readonly createdAt: string;
  updatedAt: string;
}

/**
 * A comment's author as served to a reader: their participation profile plus
 * the role they hold in this org right now. Read fresh on every read — staff
 * standing is never stored on a comment.
 *
 * Deliberately omits `email`. Learners read each other's comments, and the
 * list must not be a directory of the cohort's addresses. The moderation
 * queue, which does need it, carries `authorEmail` on its own entry type.
 */
export interface CommentAuthor extends Omit<OrgUserProfile, "email"> {
  role: Role;
}

export interface CommentReaction {
  readonly orgId: string;
  readonly commentId: string;
  readonly orgUserId: string;
  readonly emoji: string;
  readonly createdAt: string;
}

export interface CommentReport {
  readonly id: string;
  readonly orgId: string;
  readonly commentId: string;
  /** The reporter's `org_users.id`. */
  readonly orgUserId: string;
  readonly reason: string;
  /** null = still open. */
  resolvedAt: string | null;
  readonly createdAt: string;
}

export interface DiscussionSettings {
  readonly orgId: string;
  readonly courseId: string;
  enabled: boolean;
  /** false = replies are not accepted; comments are a flat list. */
  threaded: boolean;
  requireReview: boolean;
  reactions: boolean;
}

export interface ActivityCommentsState {
  readonly orgId: string;
  readonly activityId: string;
  state: CommentsState;
}

/** The course settings with an activity's override applied. What the service
 *  actually decides against. */
export interface CommentsConfig {
  enabled: boolean;
  threaded: boolean;
  requireReview: boolean;
  reactions: boolean;
  state: CommentsState;
}

export interface PostCommentInput {
  activityId: string;
  /** null = a root comment. */
  parentId: string | null;
  body: string;
}

/** One comment as served to a reader: the row plus what the reader is allowed
 *  to see. `body` is null when the comment is removed. */
export interface CommentView {
  id: string;
  parentId: string | null;
  author: CommentAuthor;
  /** True when the reader wrote this. Resolved server-side: the client knows
   *  the session's auth user id, never its org_users.id, so it cannot compare
   *  against `author.id` itself. */
  isOwn: boolean;
  /** null when removed — the placeholder carries `removedBy` instead. */
  body: string | null;
  status: CommentStatus;
  /** Who removed it — the author themselves, or a moderator. null unless
   *  removed. The placeholder names them. */
  removedBy: CommentAuthor | null;
  reactions: { emoji: string; count: number; reacted: boolean }[];
  createdAt: string;
  updatedAt: string;
}

export interface CommentCreated extends DomainEvent {
  type: "comment.created";
  comment: Comment;
}

export interface CommentPublished extends DomainEvent {
  type: "comment.published";
  comment: Comment;
}

export interface CommentReported extends DomainEvent {
  type: "comment.reported";
  report: CommentReport;
}

export interface CommentRemoved extends DomainEvent {
  type: "comment.removed";
  comment: Comment;
  /** The `org_users.id` that removed it — the author's own, or a moderator's. */
  removedBy: string;
}

export type DiscussionEvent =
  | CommentCreated
  | CommentPublished
  | CommentReported
  | CommentRemoved;
