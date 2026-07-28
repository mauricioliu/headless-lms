"use client";

import * as React from "react";
import { toast } from "sonner";

import type { DiscussionSettings } from "@/lib/api/types";
import { Switch } from "@/components/ui/switch";

import { setDiscussionSettingsAction } from "../actions";
import { SettingsRow } from "./settings-section";

const FIELDS = [
  { key: "enabled", label: "Enabled", hint: "Show comments on this course's lessons." },
  { key: "threaded", label: "Replies", hint: "Let learners reply to a comment." },
  {
    key: "requireReview",
    label: "Review before publishing",
    hint: "Hold learner comments until a moderator approves them.",
  },
  { key: "reactions", label: "Reactions", hint: "Let learners react to a comment." },
] as const;

export function CommentsSettings({ settings }: { settings: DiscussionSettings }) {
  const [value, setValue] = React.useState(settings);
  const [isPending, startTransition] = React.useTransition();

  function update(key: (typeof FIELDS)[number]["key"], next: boolean) {
    const previous = value;
    setValue({ ...value, [key]: next });
    startTransition(async () => {
      try {
        await setDiscussionSettingsAction(settings.courseId, { [key]: next });
      } catch (err) {
        setValue(previous);
        toast.error("Could not save", { description: (err as Error).message });
      }
    });
  }

  return (
    <div className="divide-y divide-line">
      {FIELDS.map(({ key, label, hint }) => (
        <SettingsRow
          key={key}
          htmlFor={`comments-${key}`}
          label={label}
          hint={hint}
          control={
            <Switch
              id={`comments-${key}`}
              checked={value[key]}
              // The other three have no effect while comments are off.
              disabled={isPending || (key !== "enabled" && !value.enabled)}
              onCheckedChange={(next) => update(key, next)}
            />
          }
        />
      ))}
    </div>
  );
}
