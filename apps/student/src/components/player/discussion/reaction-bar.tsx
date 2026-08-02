"use client";

import { useState } from "react";
import { SmilePlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ReactionCounts, ReactionEmoji } from "@/lib/api/types";
import { REACTIONS, reactionLabel, usedReactions } from "./reactions";

export function ReactionBar({
  reactions,
  viewerReaction,
  canReact,
  onReact,
}: {
  reactions: ReactionCounts;
  viewerReaction: ReactionEmoji | undefined;
  canReact: boolean;
  onReact: (emoji: ReactionEmoji | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const used = usedReactions(reactions);

  if (!canReact && used.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {used.map(([emoji, count]) => {
        const mine = viewerReaction === emoji;
        const pill = cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium transition-colors",
          mine ? "border-brand text-ink" : "border-line text-ink-3",
        );
        const body = (
          <>
            <span className="text-[13px] leading-none">{emoji}</span>
            <span className="tabular-nums">{count}</span>
          </>
        );
        return canReact ? (
          <button
            key={emoji}
            type="button"
            title={reactionLabel(emoji)}
            onClick={() => void onReact(mine ? null : emoji)}
            className={cn(pill, "hover:bg-hover-surface")}
          >
            {body}
          </button>
        ) : (
          <span key={emoji} title={reactionLabel(emoji)} className={pill}>
            {body}
          </span>
        );
      })}

      {canReact && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            className="grid size-6 place-items-center rounded-full text-ink-3 transition-colors hover:bg-hover-surface hover:text-ink"
            aria-label="Add reaction"
          >
            <SmilePlus className="size-4" />
          </PopoverTrigger>
          <PopoverContent className="w-auto max-w-[17rem] rounded-card p-1.5">
            <div className="flex flex-wrap items-center gap-0.5">
              {REACTIONS.map(({ emoji, label }) => (
                <button
                  key={emoji}
                  type="button"
                  title={label}
                  onClick={() => {
                    setOpen(false);
                    void onReact(viewerReaction === emoji ? null : emoji);
                  }}
                  className={cn(
                    "grid size-8 place-items-center rounded-full text-[17px] transition-transform hover:scale-125 hover:bg-hover-surface",
                    viewerReaction === emoji && "bg-brand-soft",
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
