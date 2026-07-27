"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormSheet } from "@/components/forms/form-sheet";
import { Field } from "@/components/forms/field";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Activity, ActivitySettings, SaveActivityInput, ThreadState } from "@/lib/api/types";

import { saveActivityAction } from "../actions";
import { setActivityThreadStateAction } from "../discussion/actions";

const THREAD_OPTIONS: { value: ThreadState | null; label: string }[] = [
  { value: null, label: "Course default" },
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Hidden" },
  { value: "locked", label: "Locked" },
];

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give this activity a title")
    .max(120, "Keep the title under 120 characters"),
  published: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const FORM_ID = "item-form";

/** Read the opaque settings blob as the admin-side shape. */
function settingsOf(activity: Activity | null): ActivitySettings {
  return (activity?.settings ?? {}) as ActivitySettings;
}

function toDefaults(item: Activity | null): FormValues {
  const s = settingsOf(item);
  return {
    title: s.title ?? "",
    published: s.published ?? false,
  };
}

export function ItemFormSheet({
  open,
  onOpenChange,
  courseId,
  moduleId,
  item,
  threadState,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  moduleId: string;
  item: Activity | null;
  threadState?: ThreadState | null;
}) {
  const isEdit = item != null;
  const [isPending, startTransition] = React.useTransition();

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(item),
  });

  const [thread, setThread] = React.useState<ThreadState | null>(threadState ?? null);

  // Re-seed the form (and the thread-state control) whenever the sheet opens
  // for a different target.
  React.useEffect(() => {
    if (open) {
      reset(toDefaults(item));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- re-seeding a local control from the opening target, not syncing derived state
      setThread(threadState ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, threadState]);

  function onValid(values: FormValues) {
    // Preserve any settings fields the editor doesn't surface (e.g. body).
    const settings: ActivitySettings = {
      ...settingsOf(item),
      title: values.title,
      published: values.published,
    };
    const payload: SaveActivityInput = {
      ...(isEdit ? { id: item!.id } : {}),
      settings,
      assetIds: item?.assetIds,
    };

    startTransition(async () => {
      try {
        const saved = await saveActivityAction(courseId, moduleId, payload);
        // Thread state is a separate discussion-context row, not part of the
        // opaque settings blob, so it's a second call — and only when it
        // actually changed (a brand-new activity left on "Course default"
        // makes no second call at all).
        if (thread !== (threadState ?? null)) {
          const activityId = isEdit
            ? item!.id
            : saved.find((m) => m.id === moduleId)?.activities?.at(-1)?.id;
          if (activityId) {
            await setActivityThreadStateAction(activityId, thread);
          }
        }
        toast.success("Saved");
        onOpenChange(false);
      } catch (err) {
        toast.error("Something went wrong", { description: (err as Error).message });
      }
    });
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit activity" : "New activity"}
      description={
        isEdit
          ? "Update this activity's details."
          : "Add content to this module. You can reorder it afterwards."
      }
      formId={FORM_ID}
      submitLabel={isEdit ? "Save changes" : "Add activity"}
      pending={isPending}
    >
      <form id={FORM_ID} onSubmit={handleSubmit(onValid)} className="flex flex-col gap-5">
        <Field id="title" label="Title" required error={errors.title?.message}>
          <Input id="title" placeholder="Welcome & overview" autoFocus {...register("title")} />
        </Field>

        <Field
          id="published"
          label="Visibility"
          hint="Published activities are visible to enrolled students."
        >
          <div className="flex items-center justify-between rounded-md border border-line bg-surface-2 px-3 py-2.5">
            <span className="text-sm text-ink-2">Published</span>
            <Controller
              control={control}
              name="published"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>
        </Field>

        <div className="space-y-1.5">
          <Label>Discussion</Label>
          <div className="inline-flex flex-wrap gap-1 rounded-md border border-line p-0.5">
            {THREAD_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setThread(option.value)}
                className={`rounded px-2.5 py-1 text-xs font-medium ${
                  thread === option.value ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-3">
            Inherits the course setting unless overridden here.
          </p>
        </div>
      </form>
    </FormSheet>
  );
}
