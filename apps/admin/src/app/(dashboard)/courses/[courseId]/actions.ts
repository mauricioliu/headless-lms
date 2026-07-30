"use server";

// Server actions for course-builder (detail) mutations.

import { revalidatePath } from "next/cache";
import { Courses } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type {
  ActivityContent,
  ActivitySettings,
  Course,
  CourseSettings,
  Module,
  SaveActivityInput,
} from "@/lib/api/types";

/**
 * Revalidate the builder route AND the courses list. The `[courseId]` + "page"
 * scope revalidates the dynamic detail page for any course; module/activity
 * counts and course status/title also surface on the list, so revalidate both
 * to avoid cross-route staleness.
 */
function revalidateBuilder(): void {
  revalidatePath("/courses/[courseId]", "page");
  revalidatePath("/courses");
}

// --- modules ---------------------------------------------------------------

export async function reorderModulesAction(
  courseId: string,
  orderedIds: string[],
): Promise<Module[]> {
  const modules = await Courses.reorderModules({ courseId, orderedIds }, await authHeaders());
  revalidateBuilder();
  return modules;
}

export async function createModuleAction(courseId: string, title: string): Promise<Module[]> {
  const modules = await Courses.createModule({ courseId, title }, await authHeaders());
  revalidateBuilder();
  return modules;
}

export async function updateModuleAction(
  courseId: string,
  moduleId: string,
  title: string,
): Promise<Module[]> {
  const modules = await Courses.updateModule({ courseId, moduleId, title }, await authHeaders());
  revalidateBuilder();
  return modules;
}

export async function deleteModuleAction(courseId: string, moduleId: string): Promise<Module[]> {
  const modules = await Courses.deleteModule({ courseId, moduleId }, await authHeaders());
  revalidateBuilder();
  return modules;
}

// --- activities ------------------------------------------------------------

export async function reorderActivitiesAction(
  courseId: string,
  moduleId: string,
  orderedIds: string[],
): Promise<Module[]> {
  const modules = await Courses.reorderActivities(
    { courseId, moduleId, orderedIds },
    await authHeaders(),
  );
  revalidateBuilder();
  return modules;
}

export async function saveActivityAction(
  courseId: string,
  moduleId: string,
  activity: SaveActivityInput,
): Promise<Module[]> {
  // Activities are uniform: the body is just the opaque settings + assets.
  const body = { settings: activity.settings, assetIds: activity.assetIds };
  const modules = activity.id
    ? await Courses.updateActivity(
        { courseId, moduleId, activityId: activity.id, ...body },
        await authHeaders(),
      )
    : await Courses.createActivity({ courseId, moduleId, ...body }, await authHeaders());
  revalidateBuilder();
  return modules;
}

/**
 * Persist the content editor's output for one activity. The blob is stored
 * verbatim under `settings.content`; every other settings field (title,
 * published, …) is preserved by re-reading the activity and merging. This
 * action knows nothing about the editor's format — it just stores the blob.
 */
export async function saveActivityContentAction(
  courseId: string,
  moduleId: string,
  activityId: string,
  content: ActivityContent,
): Promise<void> {
  const modules = await Courses.listModules({ courseId }, await authHeaders());
  const activity = modules
    .find((m) => m.id === moduleId)
    ?.activities.find((a) => a.id === activityId);
  if (!activity) throw new Error("Activity not found");

  const settings: ActivitySettings = {
    ...((activity.settings ?? {}) as ActivitySettings),
    content,
  };
  await Courses.updateActivity(
    { courseId, moduleId, activityId, settings, assetIds: activity.assetIds },
    await authHeaders(),
  );
  revalidateBuilder();
}

export async function deleteActivityAction(
  courseId: string,
  moduleId: string,
  activityId: string,
): Promise<Module[]> {
  const modules = await Courses.deleteActivity(
    { courseId, moduleId, activityId },
    await authHeaders(),
  );
  revalidateBuilder();
  return modules;
}

// --- course-level writes surfaced by the builder ---------------------------

/** Publish/unpublish from the builder header. */
export async function setCoursePublishedAction(
  courseId: string,
  status: Course["status"],
): Promise<Course> {
  const course = await Courses.updateCourse({ id: courseId, status }, await authHeaders());
  revalidateBuilder();
  return course;
}

/**
 * Course settings tab. Settings live in their own store behind
 * `PATCH /courses/:id/settings` — a partial patch, so omitted keys keep their
 * stored value. Returns the complete settings the server stored.
 */
export async function updateCourseSettingsAction(
  courseId: string,
  settings: Partial<CourseSettings>,
): Promise<CourseSettings> {
  const updated = await Courses.updateCourseSettings(
    { id: courseId, ...settings },
    await authHeaders(),
  );
  revalidateBuilder();
  return updated;
}

/** Edit course details (title / category / description) from the builder sheet. */
export async function updateCourseDetailsAction(
  courseId: string,
  patch: { title: string; category: string; description: string },
): Promise<Course> {
  const course = await Courses.updateCourse(
    {
      id: courseId,
      title: patch.title,
      category: patch.category,
      description: patch.description,
    },
    await authHeaders(),
  );
  revalidateBuilder();
  return course;
}
