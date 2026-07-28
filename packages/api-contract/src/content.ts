// Content resource schemas (courses). The single source of truth for the Course
// payload: the Fastify routes validate requests/responses against these, the
// OpenAPI spec is built from them, and the frontend SDK is generated off that spec.
import { z } from "zod";
import { ListQuery, paginated } from "./shared.js";

export const CourseStatus = z.enum(["draft", "published"]);
export type CourseStatus = z.infer<typeof CourseStatus>;

/** Course-wide delivery settings. Always returned complete; patched partially. */
export const CourseSettings = z.object({
  transcriptDownloads: z.boolean(),
});
export type CourseSettings = z.infer<typeof CourseSettings>;

/** Settings patch body — omitted keys keep their stored value. */
export const PatchCourseSettings = CourseSettings.partial();
export type PatchCourseSettings = z.infer<typeof PatchCourseSettings>;

export const Course = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string(),
  status: CourseStatus,
  category: z.string(),
  thumbnailAssetId: z.string().nullable(),
  settings: CourseSettings,
  moduleCount: z.number().int(),
  activityCount: z.number().int(),
  enrolledCount: z.number().int(),
  updatedAt: z.string(),
  createdAt: z.string(),
});
export type Course = z.infer<typeof Course>;

export const CreateCourse = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  category: z.string().default(""),
});
export type CreateCourse = z.infer<typeof CreateCourse>;

export const UpdateCourse = CreateCourse.partial().extend({
  status: CourseStatus.optional(),
  /** null clears the cover. */
  thumbnailAssetId: z.string().nullable().optional(),
  settings: CourseSettings.partial().optional(),
});
export type UpdateCourse = z.infer<typeof UpdateCourse>;

export const CoursesQuery = ListQuery.extend({
  status: CourseStatus.optional(),
  category: z.string().optional(),
});
export type CoursesQuery = z.infer<typeof CoursesQuery>;

export const CoursesPage = paginated(Course);
export type CoursesPage = z.infer<typeof CoursesPage>;

export const CourseIdParam = z.object({ id: z.string() });
export type CourseIdParam = z.infer<typeof CourseIdParam>;
