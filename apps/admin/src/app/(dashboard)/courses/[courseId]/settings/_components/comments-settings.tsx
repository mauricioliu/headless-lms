"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { CommentSettings } from "@/lib/api/types";
import { SettingRow, SettingsSection } from "@/components/forms/settings-section";
import { Switch } from "@/components/ui/switch";

import { setCommentsSettingsAction } from "../actions";

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

/** What an unconfigured course reads as — the API stores no comments block
 *  until one is written. */
const OFF: CommentSettings = {
  enabled: false,
  threaded: false,
  requireReview: false,
  reactions: false,
};

export function CommentsSettings({
  courseId,
  settings,
}: {
  courseId: string;
  settings: CommentSettings | undefined;
}) {
  const [value, setValue] = useState(settings ?? OFF);
  const [isPending, startTransition] = useTransition();

  function update(key: (typeof FIELDS)[number]["key"], checked: boolean) {
    const previous = value;
    const next = { ...value, [key]: checked };
    setValue(next);
    startTransition(async () => {
      try {
        // The patch replaces the whole block, so send every field.
        await setCommentsSettingsAction(courseId, next);
      } catch (err) {
        setValue(previous);
        toast.error("Could not save", { description: (err as Error).message });
      }
    });
  }

  return (
    <SettingsSection title="Comments" description="Discussion on this course's lessons.">
      {FIELDS.map(({ key, label, hint }) => (
        <SettingRow key={key} id={`comments-${key}`} label={label} hint={hint}>
          <Switch
            id={`comments-${key}`}
            checked={value[key]}
            // The other three have no effect while comments are off.
            disabled={isPending || (key !== "enabled" && !value.enabled)}
            onCheckedChange={(next) => update(key, next)}
          />
        </SettingRow>
      ))}
    </SettingsSection>
  );
}
