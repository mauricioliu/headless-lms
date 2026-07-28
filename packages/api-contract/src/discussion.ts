// Discussion resource schemas. A thread attaches to an activity; settings are
// per course with an optional per-activity thread state.
//
// The author is the participation's profile minus its email — learners read each
// other's comments and the thread must not be a directory of the cohort's
// addresses. The moderation queue carries `authorEmail` separately.
import { z } from "zod";
import { OrgRole, OrgUserProfileSchema } from "./shared.js";

export const CommentStatus = z.enum(["pending", "published", "removed"]);
export type CommentStatus = z.infer<typeof CommentStatus>;

export const ThreadState = z.enum(["visible", "hidden", "locked"]);
export type ThreadState = z.infer<typeof ThreadState>;

export const CommentAuthor = OrgUserProfileSchema.omit({ email: true }).extend({
  role: OrgRole,
});
export type CommentAuthor = z.infer<typeof CommentAuthor>;

export const ReactionSummary = z.object({
  emoji: z.string(),
  count: z.number().int(),
  /** True when the requesting person is one of the reactors. */
  reacted: z.boolean(),
});
export type ReactionSummary = z.infer<typeof ReactionSummary>;

export const ThreadComment = z.object({
  id: z.string(),
  /** null = a root comment. Replies nest one level. */
  parentId: z.string().nullable(),
  author: CommentAuthor,
  /** True when the reader wrote it. Resolved server-side — the client never
   *  learns its own org_users.id. */
  isOwn: z.boolean(),
  /** null for a removed comment — the placeholder carries removedBy instead. */
  body: z.string().nullable(),
  status: CommentStatus,
  /** Who removed it. null unless removed. */
  removedBy: CommentAuthor.nullable(),
  reactions: z.array(ReactionSummary),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ThreadComment = z.infer<typeof ThreadComment>;

export const ResolvedThreadConfig = z.object({
  enabled: z.boolean(),
  threaded: z.boolean(),
  requireReview: z.boolean(),
  reactions: z.boolean(),
  state: ThreadState,
});
export type ResolvedThreadConfig = z.infer<typeof ResolvedThreadConfig>;

export const ThreadView = z.object({
  config: ResolvedThreadConfig,
  comments: z.array(ThreadComment),
});
export type ThreadView = z.infer<typeof ThreadView>;

export const PostComment = z.object({
  body: z.string().min(1).max(10_000),
  parentId: z.string().nullable().default(null),
});
export type PostComment = z.infer<typeof PostComment>;

export const EditComment = z.object({
  body: z.string().min(1).max(10_000),
});
export type EditComment = z.infer<typeof EditComment>;

/** A staff PATCH is either a body edit or a status write — never both, never
 *  neither. Deliberately not a `z.union`: `@hey-api/openapi-ts` has mishandled
 *  union schemas on this branch before, so this is an object with both fields
 *  optional plus a refinement instead. */
export const PatchComment = z
  .object({
    body: z.string().min(1).max(10_000).optional(),
    status: z.literal('published').optional(),
  })
  .refine((v) => (v.body === undefined) !== (v.status === undefined), {
    message: 'provide exactly one of body or status',
  });
export type PatchComment = z.infer<typeof PatchComment>;

export const ReactToComment = z.object({
  emoji: z.string().min(1).max(16),
});
export type ReactToComment = z.infer<typeof ReactToComment>;

export const ReportComment = z.object({
  reason: z.string().max(1_000).default(""),
});
export type ReportComment = z.infer<typeof ReportComment>;

/** The stored row. No courseId — which course an activity sits in is content's
 *  fact, resolved at read time. */
export const Comment = z.object({
  id: z.string(),
  activityId: z.string(),
  parentId: z.string().nullable(),
  orgUserId: z.string(),
  body: z.string(),
  status: CommentStatus,
  removedBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Comment = z.infer<typeof Comment>;

export const CommentReport = z.object({
  id: z.string(),
  commentId: z.string(),
  orgUserId: z.string(),
  reason: z.string(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type CommentReport = z.infer<typeof CommentReport>;

export const DiscussionSettings = z.object({
  orgId: z.string(),
  courseId: z.string(),
  enabled: z.boolean(),
  threaded: z.boolean(),
  requireReview: z.boolean(),
  reactions: z.boolean(),
});
export type DiscussionSettings = z.infer<typeof DiscussionSettings>;

export const SetDiscussionSettings = z.object({
  enabled: z.boolean().optional(),
  threaded: z.boolean().optional(),
  requireReview: z.boolean().optional(),
  reactions: z.boolean().optional(),
});
export type SetDiscussionSettings = z.infer<typeof SetDiscussionSettings>;

export const SetThreadState = z.object({
  /**
   * null clears the override so the course setting applies again.
   *
   * Spelled as a literal union rather than `ThreadState.nullable()`: hey-api's
   * openapi-ts (0.99.0) drops the `null` arm when a required property is a
   * `{ type: "string", enum: [...], nullable: true }` schema, generating
   * `"visible" | "hidden" | "locked"` with no `null`. A literal union instead
   * serializes as `anyOf` of single-value enums + `nullable: true`, which the
   * generator handles correctly — verified via `pnpm gen:sdk`.
   */
  state: z.union([z.literal("visible"), z.literal("hidden"), z.literal("locked"), z.null()]),
});
export type SetThreadState = z.infer<typeof SetThreadState>;

/** Explicit overrides only, keyed by activity id. An activity that is absent
 *  inherits its course setting. */
export const ThreadStates = z.object({
  states: z.record(z.string(), ThreadState),
});
export type ThreadStates = z.infer<typeof ThreadStates>;

export const QueueReport = z.object({
  reporter: CommentAuthor,
  reason: z.string(),
  createdAt: z.string(),
});
export type QueueReport = z.infer<typeof QueueReport>;

export const QueueEntry = z.object({
  comment: Comment,
  author: CommentAuthor,
  /** Staff-scoped surface only. Identifying a spam account is the decision. */
  authorEmail: z.string(),
  courseId: z.string(),
  activityTitle: z.string(),
  reports: z.array(QueueReport),
});
export type QueueEntry = z.infer<typeof QueueEntry>;

export const ModerationQueue = z.object({
  entries: z.array(QueueEntry),
});
export type ModerationQueue = z.infer<typeof ModerationQueue>;

export const ModerationQueueQuery = z.object({
  kind: z.enum(["pending", "reported"]),
  courseId: z.string().optional(),
});
export type ModerationQueueQuery = z.infer<typeof ModerationQueueQuery>;

export const DiscussionActivityParam = z.object({ activityId: z.string() });
export type DiscussionActivityParam = z.infer<typeof DiscussionActivityParam>;

export const CommentIdParam = z.object({ commentId: z.string() });
export type CommentIdParam = z.infer<typeof CommentIdParam>;

export const CommentReactionParam = z.object({ commentId: z.string(), emoji: z.string() });
export type CommentReactionParam = z.infer<typeof CommentReactionParam>;

export const DiscussionCourseParam = z.object({ courseId: z.string() });
export type DiscussionCourseParam = z.infer<typeof DiscussionCourseParam>;
