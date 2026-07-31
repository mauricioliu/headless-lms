// Settings tab: every course-level setting, one section per group.
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

  const course = await serverApi.getCourse(courseId);

  const thumbnailUrl = course.thumbnailAssetId
    ? await getAssetUrlAction(course.thumbnailAssetId).catch(() => null)
    : null;

  return (
    <div className="max-w-4xl divide-y divide-line">
      <SettingsSection
        title="Details"
      >
        <BasicsForm course={course} />
      </SettingsSection>

      <SettingsSection
        title="Thumbnail"
        description="The cover image for this course. Upload a new one or link an image already in your media library."
      >
        <ThumbnailField courseId={course.id} assetId={course.thumbnailAssetId} url={thumbnailUrl} />
      </SettingsSection>

      <SettingsSection title="Comments" description="">
        <CommentsSettings courseId={course.id} settings={course.settings.comments} />
      </SettingsSection>

      <SettingsSection
        title="Video"
        description="How videos behave for students taking this course."
      >
        <CourseSettingsForm course={course} />
      </SettingsSection>
    </div>
  );
}
