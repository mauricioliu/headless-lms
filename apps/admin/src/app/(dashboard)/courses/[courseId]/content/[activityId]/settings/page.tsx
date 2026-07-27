import { notFound } from "next/navigation";

import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { ActivitySettingsForm } from "./activity-settings-form";

// Settings view for one activity: its entry in the curriculum plus the delivery
// rules that apply to it. Saved through the activity's opaque settings blob.
export default async function ActivitySettingsPage({
  params,
}: {
  params: Promise<{ courseId: string; activityId: string }>;
}) {
  const { courseId, activityId } = await params;

  const modulesPromise = serverApi.listModules(courseId);
  const coursePromise = serverApi.getCourse(courseId);
  await requireAuth(modulesPromise, coursePromise);
  const [modules, course] = await Promise.all([modulesPromise, coursePromise]);

  const parent = modules.find((m) => m.activities.some((a) => a.id === activityId));
  const activity = parent?.activities.find((a) => a.id === activityId);
  if (!parent || !activity) notFound();

  return (
    <ActivitySettingsForm
      courseId={courseId}
      moduleId={parent.id}
      activity={activity}
      courseTranscriptDownloads={course.settings.transcriptDownloads}
    />
  );
}
