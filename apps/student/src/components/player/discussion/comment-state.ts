// Everything about an activity's comments that is not React: grouping,
// permissions and the optimistic transitions. Kept separate so the rules are
// testable without a renderer, the way lib/video-tracking.ts is.
import type {
  ActivityComments,
  CommentAuthor,
  CommentsConfig,
  CommentView,
  ReactionCounts,
  ReactionEmoji,
} from "@/lib/api/types";

export type CommentsStatus = "loading" | "ready" | "error" | "off";

export interface CommentsPanelState {
  status: CommentsStatus;
  config: CommentsConfig | null;
  comments: CommentView[];
  /** Set by a failed mutation; the comments stay on screen. */
  error: string | null;
}

export const initialCommentsState: CommentsPanelState = {
  status: "loading",
  config: null,
  comments: [],
  error: null,
};

export type CommentsAction =
  | { kind: "loading" }
  | { kind: "loaded"; view: ActivityComments }
  | { kind: "failed"; message: string }
  | { kind: "inserted"; comment: CommentView }
  | { kind: "replaced"; id: string; comment: CommentView }
  | { kind: "removed"; id: string; by: CommentAuthor }
  | { kind: "reacted"; id: string; reactions: ReactionCounts; viewerReaction?: ReactionEmoji }
  /** Rollback: put back the snapshot taken before an optimistic change. */
  | { kind: "restored"; comments: CommentView[] };

function mapOne(
  comments: CommentView[],
  id: string,
  fn: (c: CommentView) => CommentView,
): CommentView[] {
  return comments.map((c) => (c.id === id ? fn(c) : c));
}

export function commentsReducer(
  state: CommentsPanelState,
  action: CommentsAction,
): CommentsPanelState {
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
      // and groupComments decides whether it is still shown.
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
        comments: mapOne(state.comments, action.id, (c) => ({
          ...c,
          reactions: action.reactions,
          viewerReaction: action.viewerReaction,
        })),
      };
    case "restored":
      return { ...state, comments: action.comments };
  }
}

export interface CommentNode {
  comment: CommentView;
  replies: CommentView[];
}

/**
 * Roots with their replies. Mirrors the server's placeholder rule so an
 * optimistic removal behaves the same before the next fetch: a removed root
 * survives only while a visible reply hangs off it, and a removed reply is
 * never shown, because replies nest one level and hold nothing in place.
 */
export function groupComments(comments: CommentView[]): CommentNode[] {
  const roots = comments.filter((c) => c.parentId === null);
  const rootIds = new Set(roots.map((r) => r.id));
  const byParent = new Map<string, CommentView[]>();
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
 * except reporting — locked comments can still hold something a moderator
 * needs to see — and an author may still withdraw their own comment.
 */
export function permissions(
  config: CommentsConfig,
  comment: CommentView,
  orgUserId: string,
): CommentPermissions {
  const open = config.enabled && config.state === "visible";
  const live = comment.status !== "removed";
  const isOwn = comment.author.id === orgUserId;
  return {
    canReply:
      open && config.threaded && comment.parentId === null && comment.status === "published",
    canReact: open && config.reactions && live,
    canEdit: open && live && isOwn,
    canRemove: live && isOwn,
    canReport: config.state !== "hidden" && live && !isOwn,
  };
}

/** Whether the composer is offered at all. */
export function canPost(config: CommentsConfig): boolean {
  return config.enabled && config.state === "visible";
}
