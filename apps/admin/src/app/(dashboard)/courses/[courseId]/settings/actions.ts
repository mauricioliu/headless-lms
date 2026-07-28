"use server";

// Server actions for the course Settings tab.

import { revalidatePath } from "next/cache";
import { Courses, Discussion } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap } from "@/lib/api/server-call";
import type { Course, DiscussionSettings, SetDiscussionSettings } from "@/lib/api/types";

/** Set or clear (null) the course's cover. */
export async function setCourseThumbnailAction(
  courseId: string,
  thumbnailAssetId: string | null,
): Promise<Course> {
  ensureConfigured();
  const course = unwrap(
    await Courses.updateCourse({
      path: { id: courseId },
      body: { thumbnailAssetId },
      ...(await authHeaders()),
    }),
  );
  revalidatePath("/courses/[courseId]/settings", "page");
  // The cover is on the course card too.
  revalidatePath("/courses");
  return course;
}

export async function setDiscussionSettingsAction(
  courseId: string,
  patch: SetDiscussionSettings,
): Promise<DiscussionSettings> {
  ensureConfigured();
  const settings = unwrap(
    await Discussion.setDiscussionSettings({
      path: { courseId },
      body: patch,
      ...(await authHeaders()),
    }),
  );
  revalidatePath("/courses/[courseId]/settings", "page");
  // Turning comments off (or requiring review) changes what the moderation
  // queue holds, so the Comments tab is stale too.
  revalidatePath("/courses/[courseId]/discussion", "page");
  return settings;
}
