"use client";

import * as React from "react";
import type { CommentsConfig, CommentView, ReactionType } from "@/lib/api/types";

import { fullName, initials } from "@/lib/format";
import { permissions } from "./comment-state";
import { CommentComposer } from "./comment-composer";

const REACTIONS: { type: ReactionType; glyph: string }[] = [
  { type: "like", glyph: "👍" },
  { type: "celebrate", glyph: "🎉" },
  { type: "curious", glyph: "🤔" },
];

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
  orgUserId,
  isReply = false,
  onReply,
  onEdit,
  onRemove,
  onReact,
  onReport,
}: {
  comment: CommentView;
  config: CommentsConfig;
  orgUserId: string;
  isReply?: boolean;
  onReply?: (body: string) => Promise<void>;
  onEdit: (body: string) => Promise<void>;
  onRemove: () => Promise<void>;
  onReact: (type: ReactionType | null) => Promise<void>;
  onReport: (reason: string) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [replying, setReplying] = React.useState(false);
  const p = permissions(config, comment, orgUserId);

  if (comment.status === "removed") {
    return (
      <div className={isReply ? "pl-9" : ""}>
        <p className="py-2 text-[13px] italic text-ink-3">
          {comment.removedBy
            ? `Comment removed by ${fullName(comment.removedBy)}`
            : "Comment removed"}
        </p>
      </div>
    );
  }

  return (
    <div className={isReply ? "pl-9" : ""}>
      <div className="flex gap-2.5 py-2.5">
        <Avatar name={fullName(comment.author)} image={comment.author.image} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold text-ink">{fullName(comment.author)}</span>
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
            {REACTIONS.map(({ type, glyph }) => {
              const count = comment.reactions[type] ?? 0;
              const mine = comment.viewerReaction === type;
              if (!p.canReact) {
                return count > 0 ? (
                  <span
                    key={type}
                    className="rounded-full border border-line px-2 py-0.5 text-[12px] text-ink-3"
                  >
                    {glyph} {count}
                  </span>
                ) : null;
              }
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => void onReact(mine ? null : type)}
                  className={`rounded-full border px-2 py-0.5 text-[12px] ${
                    mine ? "border-brand text-ink" : "border-line text-ink-3"
                  }`}
                >
                  {glyph}
                  {count > 0 ? ` ${count}` : ""}
                </button>
              );
            })}

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
