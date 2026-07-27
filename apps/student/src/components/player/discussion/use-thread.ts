"use client";

// Fetch and mutate one activity's thread. All state transitions go through the
// reducer in ./thread-state so the rules stay testable; this file owns only the
// network calls and the request-ordering guard.
import * as React from "react";
import { Discussion } from "@headless-lms/sdk";
import type { CommentAuthor, ThreadComment } from "@/lib/api/types";

import { ensureClientSdk } from "@/lib/api/client-sdk";
import { initialThreadState, threadReducer, type ThreadPanelState } from "./thread-state";

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Something went wrong";
}

export interface UseThread extends ThreadPanelState {
  post: (body: string, parentId: string | null) => Promise<void>;
  edit: (id: string, body: string) => Promise<void>;
  remove: (id: string, by: CommentAuthor) => Promise<void>;
  react: (id: string, emoji: string, on: boolean) => Promise<void>;
  report: (id: string, reason: string) => Promise<void>;
}

export function useThread(activityId: string): UseThread {
  const [state, dispatch] = React.useReducer(threadReducer, initialThreadState);
  // Guards a response for a lesson the reader has already left.
  const current = React.useRef(activityId);

  React.useEffect(() => {
    if (!activityId) return;
    current.current = activityId;
    ensureClientSdk();
    dispatch({ kind: "loading" });
    let cancelled = false;
    void Discussion.getActivityThread({ path: { activityId } })
      .then((res) => {
        if (cancelled || current.current !== activityId) return;
        if (res.data) dispatch({ kind: "loaded", view: res.data });
        else dispatch({ kind: "failed", message: "Could not load the discussion" });
      })
      .catch((err: unknown) => {
        if (cancelled || current.current !== activityId) return;
        dispatch({ kind: "failed", message: message(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  /** Apply locally, call the server, put the snapshot back if it refuses. */
  const optimistic = React.useCallback(
    async (apply: () => void, call: () => Promise<void>) => {
      const snapshot = state.comments;
      apply();
      try {
        await call();
      } catch (err: unknown) {
        dispatch({ kind: "restored", comments: snapshot });
        dispatch({ kind: "failed", message: message(err) });
      }
    },
    [state.comments],
  );

  // Not optimistic: the server decides whether a comment lands published or
  // pending, and guessing wrong would flash the wrong badge. The composer shows
  // its own busy state while this runs, so the wait is visible.
  const post = React.useCallback(
    async (body: string, parentId: string | null) => {
      ensureClientSdk();
      try {
        const res = await Discussion.postComment({
          path: { activityId },
          body: { body, parentId },
        });
        if (!res.data) throw new Error("Could not post your comment");
        dispatch({ kind: "inserted", comment: res.data });
      } catch (err: unknown) {
        dispatch({ kind: "failed", message: message(err) });
      }
    },
    [activityId],
  );

  const edit = React.useCallback(async (id: string, body: string) => {
    ensureClientSdk();
    try {
      const res = await Discussion.editComment({ path: { commentId: id }, body: { body } });
      if (!res.data) throw new Error("Could not save your change");
      dispatch({ kind: "replaced", id, comment: res.data });
    } catch (err: unknown) {
      dispatch({ kind: "failed", message: message(err) });
    }
  }, []);

  const remove = React.useCallback(
    (id: string, by: CommentAuthor) =>
      optimistic(
        () => dispatch({ kind: "removed", id, by }),
        async () => {
          ensureClientSdk();
          await Discussion.removeOwnComment({ path: { commentId: id } });
        },
      ),
    [optimistic],
  );

  const react = React.useCallback(
    (id: string, emoji: string, on: boolean) =>
      optimistic(
        () => dispatch({ kind: "reacted", id, emoji, on }),
        async () => {
          ensureClientSdk();
          if (on) {
            await Discussion.reactToComment({ path: { commentId: id }, body: { emoji } });
          } else {
            await Discussion.unreactToComment({ path: { commentId: id }, body: { emoji } });
          }
        },
      ),
    [optimistic],
  );

  // Not optimistic: the reader needs to know the signal was actually recorded.
  const report = React.useCallback(async (id: string, reason: string) => {
    ensureClientSdk();
    try {
      await Discussion.reportComment({ path: { commentId: id }, body: { reason } });
    } catch (err: unknown) {
      dispatch({ kind: "failed", message: message(err) });
      throw err;
    }
  }, []);

  return { ...state, post, edit, remove, react, report };
}

export type { ThreadComment };
