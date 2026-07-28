// Settings tab: every course-level setting, one section per group.
import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { getAssetUrlAction } from "@/app/(dashboard)/media/actions";

import { SettingsSection } from "./_components/settings-section";
import { BasicsForm } from "./_components/basics-form";
import { ThumbnailField } from "./_components/thumbnail-field";
import { CommentsSettings } from "./_components/comments-settings";
import { CourseSettingsForm } from "../_components/course-settings-form";

export default async function CourseSettingsTab({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const coursePromise = serverApi.getCourse(courseId);
  const discussionPromise = serverApi.discussionSettings(courseId);
  await requireAuth(coursePromise, discussionPromise);
  const [course, discussion] = await Promise.all([coursePromise, discussionPromise]);

  // The stored reference is the asset id; the URL is signed fresh per render.
  // A missing or deleted asset just renders the empty cover.
  const thumbnailUrl = course.thumbnailAssetId
    ? await getAssetUrlAction(course.thumbnailAssetId).catch(() => null)
    : null;

  return (
    <div className="max-w-4xl divide-y divide-line">
      <SettingsSection
        title="Basics"
        description="The name, category, and summary learners see on the course card."
      >
        <BasicsForm course={course} />
      </SettingsSection>

      <SettingsSection
        title="Thumbnail"
        description="The cover image for this course. Upload a new one or link an image already in your media library."
      >
        <ThumbnailField
          courseId={course.id}
          assetId={course.thumbnailAssetId}
          url={thumbnailUrl}
        />
      </SettingsSection>

      <SettingsSection
        title="Comments"
        description="How learners discuss the lessons in this course. Moderation happens on the Comments tab."
      >
        <CommentsSettings settings={discussion} />
      </SettingsSection>

      <CourseSettingsForm course={course} />
    </div>
  );
}
