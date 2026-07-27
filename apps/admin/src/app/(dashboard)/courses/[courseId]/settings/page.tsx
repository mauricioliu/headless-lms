import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { CourseSettingsForm } from "../_components/course-settings-form";

// Settings tab: course-wide delivery settings (the course's `settings` blob).
export default async function CourseSettingsTab({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const coursePromise = serverApi.getCourse(courseId);
  await requireAuth(coursePromise);
  const course = await coursePromise;

  return <CourseSettingsForm course={course} />;
}
