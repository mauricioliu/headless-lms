"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { CommentSettings } from "@/lib/api/types";
import { Switch } from "@/components/ui/switch";

import { setCommentsSettingsAction } from "../actions";
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
