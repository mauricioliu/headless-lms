import { z } from "zod";
import { roleSchema } from "./organizations.js";
import { idSchema, serializableDateSchema } from "./shared.js";

export const commentStatusSchema = z.enum(["pending", "published", "removed"]);
export type CommentStatus = z.infer<typeof commentStatusSchema>;

export const reactionEmojiSchema = z.string();
export type ReactionEmoji = z.infer<typeof reactionEmojiSchema>;

export const reactionCountsSchema = z.record(reactionEmojiSchema, z.number().int().min(0));
export type ReactionCounts = z.infer<typeof reactionCountsSchema>;

export const commentSettingsSchema = z.object({
  enabled: z.boolean(),
  threaded: z.boolean(),
  requireReview: z.boolean(),
  reactions: z.boolean(),
});
export type CommentSettings = z.infer<typeof commentSettingsSchema>;

export type CommentsConfig = CommentSettings;

export const commentSchema = z.object({
  id: idSchema,
  orgId: idSchema,
  activityId: idSchema,
  parentId: idSchema.nullable(),
  orgUserId: idSchema,
  body: z.string(),
  status: commentStatusSchema,
  removedBy: idSchema.nullable(),
  createdAt: serializableDateSchema,
  updatedAt: serializableDateSchema,
});
export type Comment = z.output<typeof commentSchema>;
export type CommentInput = z.input<typeof commentSchema>;

export const commentAuthorSchema = z.object({
  id: idSchema,
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  image: z.string().nullable(),
  role: roleSchema,
});
export type CommentAuthor = z.infer<typeof commentAuthorSchema>;

export const commentReactionSchema = z.object({
  orgId: idSchema,
  commentId: idSchema,
  orgUserId: idSchema,
  emoji: reactionEmojiSchema,
  createdAt: serializableDateSchema,
});
export type CommentReaction = z.output<typeof commentReactionSchema>;

export const commentReportSchema = z.object({
  id: idSchema,
  orgId: idSchema,
  commentId: idSchema,
  orgUserId: idSchema,
  reason: z.string(),
  resolvedAt: serializableDateSchema.nullable(),
  createdAt: serializableDateSchema,
});
export type CommentReport = z.output<typeof commentReportSchema>;
export type CommentReportInput = z.input<typeof commentReportSchema>;

export const commentViewSchema = z.object({
  id: idSchema,
  activityId: idSchema,
  parentId: idSchema.nullable(),
  author: commentAuthorSchema,
  body: z.string().nullable(),
  status: commentStatusSchema,
  removedBy: commentAuthorSchema.nullable(),
  reactions: reactionCountsSchema,
  viewerReaction: reactionEmojiSchema.optional(),
  createdAt: serializableDateSchema,
  updatedAt: serializableDateSchema,
});
export type CommentView = z.output<typeof commentViewSchema>;

export const commentReportSummarySchema = z.object({
  reporter: commentAuthorSchema,
  reason: z.string(),
  createdAt: serializableDateSchema,
});
export type CommentReportSummary = z.output<typeof commentReportSummarySchema>;

export const commentListItemSchema = z.object({
  id: idSchema,
  parentId: idSchema.nullable(),
  activityId: idSchema,
  activityTitle: z.string(),
  courseId: idSchema,
  body: z.string(),
  status: commentStatusSchema,
  author: commentAuthorSchema,
  authorEmail: z.string().email(),
  removedBy: idSchema.nullable(),
  reports: z.array(commentReportSummarySchema),
  createdAt: serializableDateSchema,
  updatedAt: serializableDateSchema,
});
export type CommentListItem = z.output<typeof commentListItemSchema>;

export const listCommentsQuerySchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  search: z.string().optional(),
  sort: z.string().optional(),
  status: commentStatusSchema.optional(),
  reported: z.boolean().optional(),
  courseId: idSchema.optional(),
  activityId: idSchema.optional(),
  orgUserId: idSchema.optional(),
});
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;
