import { z } from "zod";
import { commentSettingsSchema } from "./discussion.js";
import { idSchema, jsonValueSchema } from "./shared.js";

export const contentTypeSchema = z.enum(["course", "download"]);
export type ContentType = z.infer<typeof contentTypeSchema>;

export const courseStatusSchema = z.enum(["draft", "published"]);
export type CourseStatus = z.infer<typeof courseStatusSchema>;

export const courseSettingsSchema = z.object({
  transcriptDownloads: z.boolean(),
  comments: commentSettingsSchema.optional(),
});
export type CourseSettings = z.infer<typeof courseSettingsSchema>;

export const activityCommentsRuleSchema = z.enum(["inherit", "always", "never"]);
export type ActivityCommentsRule = z.infer<typeof activityCommentsRuleSchema>;

export const activitySettingsSchema = z.object({
  comments: activityCommentsRuleSchema.optional(),
});
export type ActivitySettings = z.infer<typeof activitySettingsSchema>;

export const courseSchema = z.object({
  id: idSchema,
  title: z.string(),
  slug: z.string(),
  description: z.string(),
  status: courseStatusSchema,
  category: z.string(),
  thumbnailAssetId: idSchema.nullable(),
  settings: courseSettingsSchema,
  moduleCount: z.number().int().min(0),
  activityCount: z.number().int().min(0),
  enrolledCount: z.number().int().min(0),
  updatedAt: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
});
export type Course = z.infer<typeof courseSchema>;

export const activitySchema = z.object({
  id: idSchema,
  moduleId: idSchema,
  courseId: idSchema,
  seq: z.number().int().min(0),
  settings: jsonValueSchema,
  assetIds: z.array(idSchema),
});
export type Activity = z.infer<typeof activitySchema>;

export const moduleSchema = z.object({
  id: idSchema,
  courseId: idSchema,
  title: z.string(),
  seq: z.number().int().min(0),
  activities: z.array(activitySchema),
});
export type Module = z.infer<typeof moduleSchema>;

export const saveActivityInputSchema = z.object({
  settings: jsonValueSchema.optional(),
  assetIds: z.array(idSchema).optional(),
});
export type SaveActivityInput = z.infer<typeof saveActivityInputSchema>;

export const listCoursesQuerySchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  search: z.string().optional(),
  sort: z.string().optional(),
  status: courseStatusSchema.optional(),
  category: z.string().optional(),
});
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;

export const createCourseInputSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
});
export type CreateCourseInput = z.infer<typeof createCourseInputSchema>;

export const updateCourseInputSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  status: courseStatusSchema.optional(),
  thumbnailAssetId: idSchema.nullable().optional(),
  settings: courseSettingsSchema.partial().optional(),
});
export type UpdateCourseInput = z.infer<typeof updateCourseInputSchema>;

export const downloadStatusSchema = z.enum(["draft", "published"]);
export type DownloadStatus = z.infer<typeof downloadStatusSchema>;

export const downloadSchema = z.object({
  id: idSchema,
  title: z.string(),
  slug: z.string(),
  description: z.string(),
  status: downloadStatusSchema,
  category: z.string(),
  thumbnailAssetId: idSchema.nullable(),
  assetCount: z.number().int().min(0),
  totalSize: z.number().int().min(0),
  entitledCount: z.number().int().min(0),
  updatedAt: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
});
export type Download = z.infer<typeof downloadSchema>;

export const downloadAssetSchema = z.object({
  id: idSchema,
  assetId: idSchema,
  seq: z.number().int().min(0),
  displayName: z.string().nullable(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int().min(0),
});
export type DownloadAsset = z.infer<typeof downloadAssetSchema>;

export const listDownloadsQuerySchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  search: z.string().optional(),
  sort: z.string().optional(),
  status: downloadStatusSchema.optional(),
  category: z.string().optional(),
});
export type ListDownloadsQuery = z.infer<typeof listDownloadsQuerySchema>;

export const createDownloadInputSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
});
export type CreateDownloadInput = z.infer<typeof createDownloadInputSchema>;

export const updateDownloadInputSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  status: downloadStatusSchema.optional(),
  thumbnailAssetId: idSchema.nullable().optional(),
});
export type UpdateDownloadInput = z.infer<typeof updateDownloadInputSchema>;

export const addDownloadAssetInputSchema = z.object({
  assetId: idSchema,
  displayName: z.string().optional(),
});
export type AddDownloadAssetInput = z.infer<typeof addDownloadAssetInputSchema>;

export const reorderDownloadAssetsInputSchema = z.object({
  assetIds: z.array(idSchema),
});
export type ReorderDownloadAssetsInput = z.infer<typeof reorderDownloadAssetsInputSchema>;
