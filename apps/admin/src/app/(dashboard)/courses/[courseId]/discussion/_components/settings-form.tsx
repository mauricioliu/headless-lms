"use client";

import * as React from "react";
import { toast } from "sonner";

import type { DiscussionSettings } from "@/lib/api/types";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setDiscussionSettingsAction } from "../actions";

const FIELDS = [
  { key: "enabled", label: "Enabled", hint: "Show a comment thread on this course's lessons." },
  { key: "threaded", label: "Replies", hint: "Let learners reply to a comment." },
  {
    key: "requireReview",
    label: "Review before publishing",
    hint: "Hold learner comments until a moderator approves them.",
  },
  { key: "reactions", label: "Reactions", hint: "Let learners react to a comment." },
] as const;

export function SettingsForm({ settings }: { settings: DiscussionSettings }) {
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
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">Settings</h2>
      <div className="mt-4 space-y-4">
        {FIELDS.map(({ key, label, hint }) => (
          <div key={key} className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <Label htmlFor={`discussion-${key}`}>{label}</Label>
              <p className="mt-0.5 text-xs text-ink-3">{hint}</p>
            </div>
            <Switch
              id={`discussion-${key}`}
              checked={value[key]}
              // The other three have no effect while discussion is off.
              disabled={isPending || (key !== "enabled" && !value.enabled)}
              onCheckedChange={(next) => update(key, next)}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
