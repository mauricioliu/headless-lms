"use client";

import * as React from "react";

import { useApp } from "@/lib/store";
import { canPost, groupComments } from "./comment-state";
import { useComments } from "./use-comments";
import { CommentComposer } from "./comment-composer";
import { CommentItem } from "./comment-item";

export function DiscussionPanel({ activityId }: { activityId: string }) {
  const panel = useComments(activityId);
  const { showToast } = useApp();

  // Surface a refused mutation once, then let the comments carry on.
  const lastError = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (panel.error && panel.error !== lastError.current) {
      lastError.current = panel.error;
      showToast(panel.error);
    }
    if (!panel.error) lastError.current = null;
  }, [panel.error, showToast]);

  // Disabled for the course, or hidden on this activity: render nothing at all.
  if (panel.status === "off" || panel.status === "loading") {
    return null;
  }

  if (panel.status === "error" || !panel.config) {
    return (
      <section className="mx-auto w-full max-w-3xl px-6 pb-10">
        <div className="border-t border-line pt-6">
          <p className="text-[13.5px] text-ink-3">
            The discussion could not be loaded.{" "}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="font-semibold underline"
            >
              Retry
            </button>
          </p>
        </div>
      </section>
    );
  }

  const config = panel.config;
  const nodes = groupComments(panel.comments);
  const count = nodes.reduce((n, node) => n + 1 + node.replies.length, 0);
  const open = canPost(config);

  return (
    <section className="mx-auto w-full max-w-3xl px-6 pb-10">
      <div className="border-t border-line pt-6">
        <h2 className="text-[15px] font-semibold text-ink">
          Discussion{count > 0 ? ` · ${count}` : ""}
        </h2>

        {open ? (
          <div className="mt-3">
            <CommentComposer
              placeholder="Ask a question or share what helped"
              submitLabel="Post"
              onSubmit={(body) => panel.post(body, null)}
            />
          </div>
        ) : (
          <p className="mt-3 text-[13.5px] text-ink-3">
            This discussion is closed. You can still read what has been posted.
          </p>
        )}

        {nodes.length === 0 && open && (
          <p className="mt-4 text-[13.5px] text-ink-3">
            No comments yet — be the first to say something.
          </p>
        )}

        <div className="mt-2 divide-y divide-line">
          {nodes.map(({ comment, replies }) => (
            <div key={comment.id} className="py-1">
              <CommentItem
                comment={comment}
                config={config}
                onReply={(body) => panel.post(body, comment.id)}
                onEdit={(body) => panel.edit(comment.id, body)}
                onRemove={() => panel.remove(comment.id, comment.author)}
                onReact={(emoji, on) => panel.react(comment.id, emoji, on)}
                onReport={async (reason) => {
                  try {
                    await panel.report(comment.id, reason);
                    showToast("Reported — thank you");
                  } catch {
                    // Already surfaced via the panel.error effect above.
                  }
                }}
              />
              {replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  config={config}
                  isReply
                  onEdit={(body) => panel.edit(reply.id, body)}
                  onRemove={() => panel.remove(reply.id, reply.author)}
                  onReact={(emoji, on) => panel.react(reply.id, emoji, on)}
                  onReport={async (reason) => {
                    try {
                      await panel.report(reply.id, reason);
                      showToast("Reported — thank you");
                    } catch {
                      // Already surfaced via the panel.error effect above.
                    }
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
