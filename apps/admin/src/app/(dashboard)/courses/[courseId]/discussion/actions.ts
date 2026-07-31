"use server";

// Server actions for the course's moderation queue. The comment settings action
// lives with the Settings tab (`../settings/actions`).

import { revalidatePath } from "next/cache";
import { Discussion } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";

export async function approveCommentAction(commentId: string): Promise<void> {
  await Discussion.editComment({ commentId, status: "published" }, await authHeaders());
  revalidatePath("/courses/[courseId]/discussion", "page");
}

export async function moderateRemoveCommentAction(commentId: string): Promise<void> {
  await Discussion.moderateRemoveComment({ commentId }, await authHeaders());
  revalidatePath("/courses/[courseId]/discussion", "page");
}

export async function restoreCommentAction(commentId: string): Promise<void> {
  await Discussion.editComment({ commentId, status: "published" }, await authHeaders());
  revalidatePath("/courses/[courseId]/discussion", "page");
}

export async function replyToCommentAction(commentId: string, body: string): Promise<void> {
  await Discussion.replyToComment({ commentId, body }, await authHeaders());
  revalidatePath("/courses/[courseId]/discussion", "page");
}

export async function resolveCommentReportsAction(commentId: string): Promise<void> {
  await Discussion.editComment({ commentId }, await authHeaders());
  revalidatePath("/courses/[courseId]/discussion", "page");
}

/** Selection actions. One request per comment — there is no batch endpoint —
 *  but a single revalidate, so the queue redraws once rather than per row. */
export async function bulkApproveCommentsAction(commentIds: string[]): Promise<void> {
  const headers = await authHeaders();
  await Promise.all(
    commentIds.map((commentId) =>
      Discussion.editComment({ commentId, status: "published" }, headers),
    ),
  );
  revalidatePath("/courses/[courseId]/discussion", "page");
}

export async function bulkRemoveCommentsAction(commentIds: string[]): Promise<void> {
  const headers = await authHeaders();
  await Promise.all(
    commentIds.map((commentId) => Discussion.moderateRemoveComment({ commentId }, headers)),
  );
  revalidatePath("/courses/[courseId]/discussion", "page");
}
