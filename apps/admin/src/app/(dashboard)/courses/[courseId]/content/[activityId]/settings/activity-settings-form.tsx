"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingRow, SettingsSection } from "@/components/forms/settings-section";
import type { Activity, ActivitySettings } from "@/lib/api/types";

import { saveActivityAction } from "../../../actions";
import { useRegisterSave } from "../_components/activity-bar-context";

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give this activity a title")
    .max(120, "Keep the title under 120 characters"),
  published: z.boolean(),
  completion: z.enum(["view", "video", "manual"]),
  transcriptDownloads: z.enum(["inherit", "always", "never"]),
  comments: z.enum(["inherit", "always", "never"]),
});

type FormValues = z.infer<typeof schema>;

const COMPLETION_LABELS: Record<FormValues["completion"], string> = {
  view: "When opened",
  video: "When the video is watched",
  manual: "When the student marks it complete",
};

const TRANSCRIPT_LABELS: Record<FormValues["transcriptDownloads"], string> = {
  inherit: "Inherit from course",
  always: "Always allow",
  never: "Never allow",
};

const COMMENTS_LABELS: Record<FormValues["comments"], string> = {
  inherit: "Inherit from course",
  always: "Always allow",
  never: "Never allow",
};

function toDefaults(settings: ActivitySettings): FormValues {
  return {
    title: settings.title ?? "",
    published: settings.published ?? false,
    completion: settings.completion ?? "view",
    transcriptDownloads: settings.transcriptDownloads ?? "inherit",
    comments: settings.comments ?? "inherit",
  };
}

/**
 * Settings view for one activity. Everything here lives in the activity's
 * opaque settings blob; the edited keys are written over the stored blob so
 * authored content (and anything else in there) survives a save. Completion
 * rule and the transcript override are authored but not yet consumed.
 */
export function ActivitySettingsForm({
  courseId,
  moduleId,
  activity,
  courseTranscriptDownloads,
  courseCommentsEnabled,
}: {
  courseId: string;
  moduleId: string;
  activity: Activity;
  courseTranscriptDownloads: boolean;
  courseCommentsEnabled: boolean;
}) {
  const router = useRouter();
  // Memoised: a fresh `{}` each render would churn the bar's save registration.
  const settings = useMemo(
    () => (activity.settings ?? {}) as ActivitySettings,
    [activity.settings],
  );
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toDefaults(settings) });

  const onValid = useCallback(
    async (values: FormValues) => {
      try {
        await saveActivityAction(courseId, moduleId, {
          id: activity.id,
          settings: { ...settings, ...values } satisfies ActivitySettings,
          assetIds: activity.assetIds,
        });
        toast.success("Settings saved");
        reset(values);
        router.refresh();
      } catch (err) {
        toast.error("Couldn't save settings", { description: (err as Error).message });
      }
    },
    [courseId, moduleId, activity.id, activity.assetIds, settings, reset, router],
  );

  const save = useCallback(() => handleSubmit(onValid)(), [handleSubmit, onValid]);
  useRegisterSave({ save, saving: isSubmitting, dirty: isDirty });

  return (
    <form onSubmit={handleSubmit(onValid)} className="flex max-w-2xl flex-col gap-6" noValidate>
      <SettingsSection title="General" description="How this activity appears in the curriculum.">
        <SettingRow
          id="activity-title"
          label="Title"
          hint="Shown to students in the course outline."
          error={errors.title?.message}
          controlClassName="w-full sm:w-72"
        >
          <Input id="activity-title" {...register("title")} />
        </SettingRow>

        <SettingRow
          id="activity-published"
          label="Published"
          hint="Draft activities stay hidden from enrolled students."
        >
          <Controller
            control={control}
            name="published"
            render={({ field }) => (
              <Switch
                id="activity-published"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Playback" description="How this activity behaves for a student.">
        <SettingRow
          id="activity-completion"
          label="Mark complete"
          hint="What counts as finishing this activity."
          controlClassName="w-full sm:w-72"
        >
          <Controller
            control={control}
            name="completion"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="activity-completion" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COMPLETION_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </SettingRow>

        <SettingRow
          id="activity-transcripts"
          label="Transcript downloads"
          hint={`The course currently ${courseTranscriptDownloads ? "allows" : "blocks"} transcript downloads.`}
          controlClassName="w-full sm:w-72"
        >
          <Controller
            control={control}
            name="transcriptDownloads"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="activity-transcripts" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRANSCRIPT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </SettingRow>

        <SettingRow
          id="activity-comments"
          label="Comments"
          hint={`The course currently has comments ${courseCommentsEnabled ? "on" : "off"}. Turning them off here overrides the course; it cannot turn them back on.`}
          controlClassName="w-full sm:w-72"
        >
          <Controller
            control={control}
            name="comments"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="activity-comments" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COMMENTS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </SettingRow>
      </SettingsSection>
    </form>
  );
}
