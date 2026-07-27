"use client";

import * as React from "react";
import type { ResolvedThreadConfig, ThreadComment } from "@/lib/api/types";

import { initials } from "@/lib/format";
import { permissions } from "./thread-state";
import { CommentComposer } from "./comment-composer";

const EMOJI = ["👍", "🎉", "🤔"];

function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element -- avatars are remote and unsized
    return <img src={image} alt="" className="size-7 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-warm-2 text-[11px] font-semibold text-ink-3">
      {initials(name)}
    </span>
  );
}

export function CommentItem({
  comment,
  config,
  isReply = false,
  onReply,
  onEdit,
  onRemove,
  onReact,
  onReport,
}: {
  comment: ThreadComment;
  config: ResolvedThreadConfig;
  isReply?: boolean;
  onReply?: (body: string) => Promise<void>;
  onEdit: (body: string) => Promise<void>;
  onRemove: () => Promise<void>;
  onReact: (emoji: string, on: boolean) => Promise<void>;
  onReport: (reason: string) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [replying, setReplying] = React.useState(false);
  const p = permissions(config, comment);

  if (comment.status === "removed") {
    return (
      <div className={isReply ? "pl-9" : ""}>
        <p className="py-2 text-[13px] italic text-ink-3">
          {comment.removedBy
            ? `Comment removed by ${comment.removedBy.name}`
            : "Comment removed"}
        </p>
      </div>
    );
  }

  return (
    <div className={isReply ? "pl-9" : ""}>
      <div className="flex gap-2.5 py-2.5">
        <Avatar name={comment.author.name} image={comment.author.image} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold text-ink">{comment.author.name}</span>
            {comment.author.role !== "student" && (
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold capitalize"
                style={{ background: "var(--brand-soft)", color: "var(--brand-strong)" }}
              >
                {comment.author.role}
              </span>
            )}
            {comment.status === "pending" && (
              <span className="rounded bg-surface-warm-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-3">
                Awaiting review
              </span>
            )}
          </div>

          {editing ? (
            <div className="mt-2">
              <CommentComposer
                placeholder="Edit your comment"
                submitLabel="Save"
                initialValue={comment.body ?? ""}
                autoFocus
                onSubmit={onEdit}
                onCancel={() => setEditing(false)}
              />
            </div>
          ) : (
            <p className="mt-1 text-[14px] leading-relaxed whitespace-pre-wrap text-ink">
              {comment.body}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {p.canReact &&
              EMOJI.map((emoji) => {
                const summary = comment.reactions.find((r) => r.emoji === emoji);
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => void onReact(emoji, !summary?.reacted)}
                    className={`rounded-full border px-2 py-0.5 text-[12px] ${
                      summary?.reacted ? "border-brand text-ink" : "border-line text-ink-3"
                    }`}
                  >
                    {emoji}
                    {summary ? ` ${summary.count}` : ""}
                  </button>
                );
              })}
            {!p.canReact &&
              comment.reactions.map((r) => (
                <span
                  key={r.emoji}
                  className="rounded-full border border-line px-2 py-0.5 text-[12px] text-ink-3"
                >
                  {r.emoji} {r.count}
                </span>
              ))}

            {p.canReply && onReply && (
              <button
                type="button"
                onClick={() => setReplying((v) => !v)}
                className="px-1.5 text-[12px] font-medium text-ink-3 hover:text-ink"
              >
                Reply
              </button>
            )}
            {p.canEdit && (
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="px-1.5 text-[12px] font-medium text-ink-3 hover:text-ink"
              >
                Edit
              </button>
            )}
            {p.canRemove && (
              <button
                type="button"
                onClick={() => void onRemove()}
                className="px-1.5 text-[12px] font-medium text-ink-3 hover:text-ink"
              >
                Delete
              </button>
            )}
            {p.canReport && (
              <button
                type="button"
                onClick={() => void onReport("")}
                className="px-1.5 text-[12px] font-medium text-ink-3 hover:text-ink"
              >
                Report
              </button>
            )}
          </div>

          {replying && onReply && (
            <div className="mt-2">
              <CommentComposer
                placeholder="Write a reply"
                submitLabel="Reply"
                autoFocus
                onSubmit={onReply}
                onCancel={() => setReplying(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
