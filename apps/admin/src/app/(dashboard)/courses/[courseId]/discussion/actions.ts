"use server";

// Server actions for the course's moderation queue. The comment settings action
// lives with the Settings tab (`../settings/actions`).

import { revalidatePath } from "next/cache";
import { Discussion } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type { CommentsState } from "@/lib/api/types";

function revalidateDiscussion(): void {
  revalidatePath("/courses/[courseId]/discussion", "page");
}

export async function approveCommentAction(commentId: string): Promise<void> {
  await Discussion.editComment({
    path: { commentId },
    body: { status: "published" },
    ...(await authHeaders()),
  });
  revalidateDiscussion();
}

export async function moderateRemoveCommentAction(commentId: string): Promise<void> {
  const headers = await authHeaders();
  await Discussion.moderateRemoveComment({ path: { commentId }, ...headers });
  revalidateDiscussion();
}

export async function restoreCommentAction(commentId: string): Promise<void> {
  await Discussion.editComment({
    path: { commentId },
    body: { status: "published" },
    ...(await authHeaders()),
  });
  revalidateDiscussion();
}

export async function resolveCommentReportsAction(commentId: string): Promise<void> {
  await Discussion.editComment({ path: { commentId }, ...(await authHeaders()) });
  revalidateDiscussion();
}

/** null clears the override so the course setting applies again. */
export async function setCommentsStateAction(
  activityId: string,
  state: CommentsState | null,
): Promise<void> {
  await Discussion.setActivityCommentsState({
    path: { activityId },
    body: { state },
    ...(await authHeaders()),
  });
  revalidatePath("/courses/[courseId]/content", "page");
}
