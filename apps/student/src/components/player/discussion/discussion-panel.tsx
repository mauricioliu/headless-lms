"use client";

import { useEffect, useRef } from "react";
import { MessageCircle } from "lucide-react";

import { useApp } from "@/lib/store";
import { canPost, groupComments } from "./comment-state";
import { useComments } from "./use-comments";
import { CommentAvatar } from "./avatar";
import { CommentComposer } from "./comment-composer";
import { CommentItem } from "./comment-item";

export function DiscussionPanel({
  activityId,
  orgUserId,
  viewerName,
}: {
  activityId: string;
  orgUserId: string;
  viewerName: string;
}) {
  const panel = useComments(activityId);
  const { showToast } = useApp();

  // Surface a refused mutation once, then let the comments carry on.
  const lastError = useRef<string | null>(null);
  useEffect(() => {
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
            No pudimos cargar los comentarios.{" "}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="font-semibold underline"
            >
              Reintentar
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
      <div className="flex flex-col gap-5 border-t border-line pt-6">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <MessageCircle className="size-4 text-ink-3" />
          Comentarios
          {count > 0 && <span className="font-normal text-ink-3 tabular-nums">{count}</span>}
        </h2>

        {open ? (
          <div className="flex gap-2.5">
            <CommentAvatar name={viewerName} />
            <div className="min-w-0 flex-1">
              <CommentComposer
                placeholder="Pregunta o comparte lo que te sirvió"
                submitLabel="Publicar"
                onSubmit={(body) => panel.post(body, null)}
              />
            </div>
          </div>
        ) : (
          <p className="text-[13.5px] text-ink-3">
            Esta conversación está cerrada, pero puedes leer lo publicado.
          </p>
        )}

        {nodes.length === 0 ? (
          open && (
            <p className="border-t border-line-divider pt-6 text-center text-[13.5px] text-ink-3">
              Aún no hay comentarios.
            </p>
          )
        ) : (
          <div className="flex flex-col gap-6 border-t border-line-divider pt-6">
            {nodes.map(({ comment, replies }) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                config={config}
                orgUserId={orgUserId}
                viewerName={viewerName}
                onReply={(body) => panel.post(body, comment.id)}
                onEdit={(body) => panel.edit(comment.id, body)}
                onRemove={() => panel.remove(comment.id, comment.author)}
                onReact={(emoji) => panel.react(comment.id, emoji)}
                onReport={async (reason) => {
                  try {
                    await panel.report(comment.id, reason);
                    showToast("Reportado. Gracias");
                  } catch {
                    // Already surfaced via the panel.error effect above.
                  }
                }}
                replies={
                  replies.length > 0 ? (
                    <div className="mt-3 flex flex-col gap-3 border-l border-line pl-4">
                      {replies.map((reply) => (
                        <CommentItem
                          key={reply.id}
                          comment={reply}
                          config={config}
                          orgUserId={orgUserId}
                          viewerName={viewerName}
                          isReply
                          onEdit={(body) => panel.edit(reply.id, body)}
                          onRemove={() => panel.remove(reply.id, reply.author)}
                          onReact={(emoji) => panel.react(reply.id, emoji)}
                          onReport={async (reason) => {
                            try {
                              await panel.report(reply.id, reason);
                              showToast("Reportado. Gracias");
                            } catch {
                              // Already surfaced via the panel.error effect above.
                            }
                          }}
                        />
                      ))}
                    </div>
                  ) : null
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
