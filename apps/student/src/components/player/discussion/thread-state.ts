// Everything about the thread that is not React: grouping, permissions and the
// optimistic transitions. Kept separate so the rules are testable without a
// renderer, the way lib/video-tracking.ts is.
import type {
  CommentAuthor,
  ResolvedThreadConfig,
  ThreadComment,
  ThreadView,
} from "@/lib/api/types";

export type ThreadStatus = "loading" | "ready" | "error" | "off";

export interface ThreadPanelState {
  status: ThreadStatus;
  config: ResolvedThreadConfig | null;
  comments: ThreadComment[];
  /** Set by a failed mutation; the thread stays on screen. */
  error: string | null;
}

export const initialThreadState: ThreadPanelState = {
  status: "loading",
  config: null,
  comments: [],
  error: null,
};

export type ThreadAction =
  | { kind: "loading" }
  | { kind: "loaded"; view: ThreadView }
  | { kind: "failed"; message: string }
  | { kind: "inserted"; comment: ThreadComment }
  | { kind: "replaced"; id: string; comment: ThreadComment }
  | { kind: "removed"; id: string; by: CommentAuthor }
  | { kind: "reacted"; id: string; emoji: string; on: boolean }
  /** Rollback: put back the snapshot taken before an optimistic change. */
  | { kind: "restored"; comments: ThreadComment[] };

function mapOne(
  comments: ThreadComment[],
  id: string,
  fn: (c: ThreadComment) => ThreadComment,
): ThreadComment[] {
  return comments.map((c) => (c.id === id ? fn(c) : c));
}

function toggleReaction(
  comment: ThreadComment,
  emoji: string,
  on: boolean,
): ThreadComment {
  const existing = comment.reactions.find((r) => r.emoji === emoji);
  if (on) {
    const reactions = existing
      ? comment.reactions.map((r) =>
          r.emoji === emoji ? { ...r, count: r.count + 1, reacted: true } : r,
        )
      : [...comment.reactions, { emoji, count: 1, reacted: true }];
    return { ...comment, reactions };
  }
  // Only the reader's own reaction goes away — everyone else's count stands.
  const reactions = comment.reactions
    .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, reacted: false } : r))
    .filter((r) => r.count > 0);
  return { ...comment, reactions };
}

export function threadReducer(
  state: ThreadPanelState,
  action: ThreadAction,
): ThreadPanelState {
  switch (action.kind) {
    case "loading":
      return { ...state, status: "loading", error: null };
    case "loaded": {
      const { config, comments } = action.view;
      // Disabled for the course and hidden on the activity look the same to a
      // reader: the section renders nothing at all, not an empty state.
      const off = !config.enabled || config.state === "hidden";
      return { status: off ? "off" : "ready", config, comments, error: null };
    }
    case "failed":
      return {
        ...state,
        status: state.status === "loading" ? "error" : state.status,
        error: action.message,
      };
    case "inserted":
      return { ...state, comments: [...state.comments, action.comment], error: null };
    case "replaced":
      return { ...state, comments: mapOne(state.comments, action.id, () => action.comment) };
    case "removed":
      // Mark rather than delete: a root with replies must stay as a placeholder,
      // and groupThread decides whether it is still shown.
      return {
        ...state,
        comments: mapOne(state.comments, action.id, (c) => ({
          ...c,
          status: "removed",
          body: null,
          removedBy: action.by,
        })),
      };
    case "reacted":
      return {
        ...state,
        comments: mapOne(state.comments, action.id, (c) =>
          toggleReaction(c, action.emoji, action.on),
        ),
      };
    case "restored":
      return { ...state, comments: action.comments };
  }
}

export interface ThreadNode {
  comment: ThreadComment;
  replies: ThreadComment[];
}

/**
 * Roots with their replies. Mirrors the server's placeholder rule so an
 * optimistic removal behaves the same before the next fetch: a removed root
 * survives only while a visible reply hangs off it, and a removed reply is
 * never shown, because replies nest one level and hold nothing in place.
 */
export function groupThread(comments: ThreadComment[]): ThreadNode[] {
  const roots = comments.filter((c) => c.parentId === null);
  const rootIds = new Set(roots.map((r) => r.id));
  const byParent = new Map<string, ThreadComment[]>();
  for (const c of comments) {
    if (c.parentId === null || c.status === "removed" || !rootIds.has(c.parentId)) {
      continue;
    }
    byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
  }
  return roots
    .filter((c) => c.status !== "removed" || (byParent.get(c.id)?.length ?? 0) > 0)
    .map((comment) => ({ comment, replies: byParent.get(comment.id) ?? [] }));
}

export interface CommentPermissions {
  canReply: boolean;
  canReact: boolean;
  canEdit: boolean;
  canRemove: boolean;
  canReport: boolean;
}

/**
 * What this comment offers this reader. Locked is read-only for everything
 * except reporting — an archived thread can still hold something a moderator
 * needs to see — and an author may still withdraw their own comment.
 */
export function permissions(
  config: ResolvedThreadConfig,
  comment: ThreadComment,
): CommentPermissions {
  const open = config.enabled && config.state === "visible";
  const live = comment.status !== "removed";
  return {
    canReply:
      open && config.threaded && comment.parentId === null && comment.status === "published",
    canReact: open && config.reactions && live,
    canEdit: open && live && comment.isOwn,
    canRemove: live && comment.isOwn,
    canReport: config.state !== "hidden" && live && !comment.isOwn,
  };
}

/** Whether the composer is offered at all. */
export function canPost(config: ResolvedThreadConfig): boolean {
  return config.enabled && config.state === "visible";
}
