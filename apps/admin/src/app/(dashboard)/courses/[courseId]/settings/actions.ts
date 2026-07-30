"use server";

// Server actions for the course Settings tab.

import { revalidatePath } from "next/cache";
import { Courses } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type { CommentSettings, Course, CourseSettings } from "@/lib/api/types";

/** Set or clear (null) the course's cover. */
export async function setCourseThumbnailAction(
  courseId: string,
  thumbnailAssetId: string | null,
): Promise<Course> {
  const course = await Courses.updateCourse({
    path: { id: courseId },
    body: { thumbnailAssetId },
    ...(await authHeaders()),
  });
  revalidatePath("/courses/[courseId]/settings", "page");
  // The cover is on the course card too.
  revalidatePath("/courses");
  return course;
}

/** Comment settings live on the course, so a write is a course settings patch
 *  carrying the whole `comments` block. */
export async function setCommentsSettingsAction(
  courseId: string,
  comments: CommentSettings,
): Promise<CourseSettings> {
  const settings = await Courses.updateCourseSettings({
    path: { id: courseId },
    body: { comments },
    ...(await authHeaders()),
  });
  revalidatePath("/courses/[courseId]/settings", "page");
  // Turning comments off (or requiring review) changes what the moderation
  // queue holds, so the Comments tab is stale too.
  revalidatePath("/courses/[courseId]/discussion", "page");
  return settings;
}
