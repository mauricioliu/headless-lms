// discussion context — domain entities, DTOs, and events.
//
// A Comment attaches to an activity and optionally replies to another comment.
// The author is an org_users participation; their profile and role are resolved
// at read time and never stored here. A removed comment is retained so its
// replies survive — only its body stops being served.
//
// A comment records NO course. Which course an activity sits in is content's
// fact and changes when a course is restructured, so it is resolved whenever a
// read scopes or filters by course.

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
 * list must not be a directory of the cohort's addresses. The staff-facing
 * comment list, which does need it, carries `authorEmail` on its own row type.
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

/** A course's discussion settings, stored as the value of its `discussion`
 *  settings row rather than in a table of its own. */
export interface CommentSettings {
  enabled: boolean;
  /** false = replies are not accepted; comments are a flat list. */
  threaded: boolean;
  requireReview: boolean;
  reactions: boolean;
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

/** An unresolved report as the staff list serves it — who flagged it and why.
 *  Resolved reports are history and never appear here. */
export interface CommentReportSummary {
  reporter: CommentAuthor;
  reason: string;
  createdAt: string;
}

/**
 * One row of the staff-facing comment list: the comment plus everything a
 * moderation decision needs without a second request — who wrote it, where it
 * sits, and what has been flagged against it.
 *
 * Flat rather than a nested comment, matching the other list rows in this
 * codebase. `body` is served whatever the status: staff have to read a removed
 * comment to judge whether removing it was right.
 */
export interface CommentListItem {
  id: string;
  /** null = a root comment. */
  parentId: string | null;
  activityId: string;
  activityTitle: string;
  /** Resolved from content at read time, never stored on the comment. */
  courseId: string;
  body: string;
  status: CommentStatus;
  author: CommentAuthor;
  /** Present only on this staff-scoped row — identifying a spam account is
   *  part of the decision. Never on a CommentView. */
  authorEmail: string;
  /** The `org_users.id` that removed it; null unless removed. */
  removedBy: string | null;
  reports: CommentReportSummary[];
  createdAt: string;
  updatedAt: string;
}

/** Filters for the staff-facing comment list. Every field narrows; omitting
 *  all of them lists the org's comments newest first. */
export interface ListCommentsQuery {
  page: number;
  pageSize: number;
  /** Substring match on the comment body. */
  search?: string | undefined;
  /** Sort field, optionally `-` prefixed for descending (e.g. `-createdAt`). */
  sort?: string | undefined;
  status?: CommentStatus | undefined;
  /** true = only comments carrying at least one unresolved report; false =
   *  only comments carrying none. Omitted leaves reports out of the filter. */
  reported?: boolean | undefined;
  /** Resolved through the activity's module, since a comment stores no course. */
  courseId?: string | undefined;
  activityId?: string | undefined;
  /** Scope to one author's `org_users.id`. */
  orgUserId?: string | undefined;
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

export type DiscussionEvent = CommentCreated | CommentPublished | CommentReported | CommentRemoved;
