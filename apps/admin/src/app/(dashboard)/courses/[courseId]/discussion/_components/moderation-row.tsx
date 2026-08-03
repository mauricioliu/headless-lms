"use client";

import type { ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { NameAvatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useIsSelected } from "./selection";

/**
 * The row shell. Owns only the checkbox and the selected/flagged styling — the
 * comment itself (`children`) is server-rendered and passed straight through,
 * as is the action strip.
 */
export function ModerationRow({
  id,
  authorName,
  authorImage,
  flagged,
  removed,
  actions,
  children,
}: {
  id: string;
  authorName: string;
  authorImage: string | null;
  flagged: boolean;
  removed: boolean;
  actions: ReactNode;
  children: ReactNode;
}) {
  const [selected, setSelected] = useIsSelected(id);

  return (
    <div
      className={cn(
        "group flex gap-3 rounded-card border border-line bg-surface p-4 transition-colors",
        selected && "border-line-strong bg-selected",
        flagged && !removed && "border-danger/40",
      )}
    >
      <label className="flex cursor-pointer pt-0.5">
        <Checkbox checked={selected} onChange={(e) => setSelected(e.currentTarget.checked)} />
        <span className="sr-only">Select comment</span>
      </label>

      <NameAvatar name={authorName} image={authorImage} className="size-9" />

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {children}
        {actions}
      </div>
    </div>
  );
}
