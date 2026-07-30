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

export async function resolveCommentReportsAction(commentId: string): Promise<void> {
  await Discussion.editComment({ commentId }, await authHeaders());
  revalidatePath("/courses/[courseId]/discussion", "page");
}
