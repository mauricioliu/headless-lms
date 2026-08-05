"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { SettingRow, SettingsSection } from "@/components/forms/settings-section";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Course } from "@/lib/api/types";

import { updateCourseSettingsAction } from "../actions";

const schema = z.object({
  transcriptDownloads: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

// Settings tab: course-wide delivery toggles, stored in the course's settings
// blob. Nothing consumes transcript downloads yet — the value is authored and
// persisted here, and the player will read it.
export function CourseSettingsForm({ course }: { course: Course }) {
  const router = useRouter();
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { transcriptDownloads: course.settings.transcriptDownloads },
  });

  async function onValid(values: FormValues) {
    try {
      const updated = await updateCourseSettingsAction(course.id, values);
      toast.success("Settings saved");
      // Re-baseline against what the server stored (clears the dirty state).
      reset({ transcriptDownloads: updated.transcriptDownloads });
      router.refresh();
    } catch (err) {
      toast.error("Couldn't save settings", { description: (err as Error).message });
    }
  }

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate>
      <SettingsSection
        title="Video"
        description="How videos behave for students taking this course."
        footer={
          <Button type="submit" variant="primary" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        }
      >
        <SettingRow
          id="transcript-downloads"
          label="Allow transcript downloads"
          hint="Students can download a text transcript for every video in this course."
        >
          <Controller
            control={control}
            name="transcriptDownloads"
            render={({ field }) => (
              <Switch
                id="transcript-downloads"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </SettingRow>
      </SettingsSection>
    </form>
  );
}
