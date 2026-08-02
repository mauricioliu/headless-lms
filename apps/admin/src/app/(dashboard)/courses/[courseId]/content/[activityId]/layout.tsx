import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { serverApi } from "@/lib/api/server";
import type { ActivitySettings } from "@/lib/api/types";

import { ActivityBar } from "./_components/activity-bar";
import { ActivityBarProvider } from "./_components/activity-bar-context";

// Shell for one activity: the action bar (back, title, Content / Settings /
// Preview switch, Save) over whichever view is on screen. The views are sibling
// route segments, so each is deep-linkable and server-renders its own data.
export default async function ActivityLayout({
  params,
  children,
}: {
  params: Promise<{ courseId: string; activityId: string }>;
  children: ReactNode;
}) {
  const { courseId, activityId } = await params;

  const modules = await serverApi.listModules(courseId);

  const activity = modules.flatMap((m) => m.activities).find((a) => a.id === activityId);
  if (!activity) notFound();

  const settings = (activity.settings ?? {}) as ActivitySettings;

  return (
    <ActivityBarProvider>
      <div className="flex flex-col gap-4">
        <ActivityBar
          courseId={courseId}
          activityId={activityId}
          title={settings.title?.trim() || "Untitled activity"}
        />
        {children}
      </div>
    </ActivityBarProvider>
  );
}
