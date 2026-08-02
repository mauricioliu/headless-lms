"use client";

import { useState } from "react";
import { Check, CornerUpLeft, Flag, MoreHorizontal, RotateCcw, Trash2, X } from "lucide-react";

import type { CommentListItem } from "@/lib/api/types";
import { Badge, Dot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NameAvatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fullName, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS: Record<
  CommentListItem["status"],
  { label: string; variant: "success" | "warning" | "neutral"; dot: string }
> = {
  published: { label: "Published", variant: "success", dot: "bg-success" },
  pending: { label: "Pending", variant: "warning", dot: "bg-warning" },
  removed: { label: "Removed", variant: "neutral", dot: "bg-ink-4" },
};

export function ModerationRow({
  comment,
  replies,
  selected,
  pending,
  onSelect,
  onApprove,
  onRemove,
  onRestore,
  onDismissReports,
  onReply,
}: {
  comment: CommentListItem;
  replies: CommentListItem[];
  selected: boolean;
  pending: boolean;
  onSelect: (id: string, next: boolean) => void;
  onApprove: (id: string) => void;
  onRemove: (id: string) => void;
  onRestore: (id: string) => void;
  onDismissReports: (id: string) => void;
  onReply: (id: string, body: string, done: () => void) => void;
}) {
  const [replying, setReplying] = useState(false);
  const removed = comment.status === "removed";
  const flagged = comment.reports.length > 0;
  const status = STATUS[comment.status];

  return (
    <div
      className={cn(
        "group flex gap-3 rounded-card border border-line bg-surface p-4 transition-colors",
        selected && "border-line-strong bg-selected",
        flagged && !removed && "border-danger/40",
      )}
    >
      <label className="flex cursor-pointer pt-0.5">
        <Checkbox
          checked={selected}
          onChange={(e) => onSelect(comment.id, e.currentTarget.checked)}
        />
        <span className="sr-only">Select comment</span>
      </label>

      <NameAvatar name={fullName(comment.author)} image={comment.author.image} className="size-9" />

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-sm font-semibold", removed ? "text-ink-3" : "text-ink")}>
            {fullName(comment.author)}
          </span>
          <span className="truncate text-xs text-ink-3">{comment.authorEmail}</span>
          <span className="text-ink-faint">·</span>
          <span className="text-xs text-ink-3">{relativeTime(comment.createdAt)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{comment.activityTitle}</Badge>
          <Badge variant={status.variant}>{status.label}</Badge>
          {flagged && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="danger">
                  <Flag />
                  {comment.reports.length} {comment.reports.length === 1 ? "report" : "reports"}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {comment.reports
                  .map((r) => `${fullName(r.reporter)}${r.reason ? ` — ${r.reason}` : ""}`)
                  .join(" · ")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <p
          className={cn(
            "text-sm leading-relaxed whitespace-pre-wrap",
            removed ? "text-ink-3 line-through decoration-ink-faint" : "text-ink",
          )}
        >
          {comment.body}
        </p>

        {replies.map((reply) => (
          <div key={reply.id} className="flex gap-2.5 rounded-card bg-muted/50s p-3">
            <NameAvatar
              name={fullName(reply.author)}
              image={reply.author.image}
              className="size-6"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-ink">{fullName(reply.author)}</span>
                {reply.author.role !== "student" && (
                  <Badge variant="brand" className="capitalize">
                    {reply.author.role}
                  </Badge>
                )}
                <span className="text-xs text-ink-3">{relativeTime(reply.createdAt)}</span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">
                {reply.body}
              </p>
            </div>
          </div>
        ))}

        {replying && (
          <ReplyBox
            pending={pending}
            onCancel={() => setReplying(false)}
            onSubmit={(body) => onReply(comment.id, body, () => setReplying(false))}
          />
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {comment.status === "pending" && (
            <Button
              size="sm"
              variant="primary"
              disabled={pending}
              onClick={() => onApprove(comment.id)}
            >
              <Check />
              Approve
            </Button>
          )}
          {!removed && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setReplying((v) => !v)}
            >
              <CornerUpLeft />
              Reply
            </Button>
          )}
          {removed ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => onRestore(comment.id)}
            >
              <RotateCcw />
              Restore
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => onRemove(comment.id)}
            >
              <Trash2 />
              Remove
            </Button>
          )}
          {flagged && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => onDismissReports(comment.id)}
            >
              <X />
              Dismiss reports
            </Button>
          )}

          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="opacity-0 transition-opacity group-hover:opacity-100 aria-expanded:opacity-100"
                >
                  <MoreHorizontal />
                  <span className="sr-only">More actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-44">
                {!removed && (
                  <DropdownMenuItem onSelect={() => setReplying(true)}>
                    <CornerUpLeft />
                    Reply
                  </DropdownMenuItem>
                )}
                {comment.status !== "published" && (
                  <DropdownMenuItem onSelect={() => onApprove(comment.id)}>
                    <Check />
                    Publish
                  </DropdownMenuItem>
                )}
                {flagged && (
                  <DropdownMenuItem onSelect={() => onDismissReports(comment.id)}>
                    <X />
                    Dismiss reports
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {removed ? (
                  <DropdownMenuItem onSelect={() => onRestore(comment.id)}>
                    <RotateCcw />
                    Restore
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem variant="danger" onSelect={() => onRemove(comment.id)}>
                    <Trash2 />
                    Remove
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Reply as the moderator, inline under the comment being answered. */
function ReplyBox({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        autoFocus
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Reply as a moderator"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={pending || !trimmed}
          onClick={() => onSubmit(trimmed)}
        >
          Post reply
        </Button>
      </div>
    </div>
  );
}
