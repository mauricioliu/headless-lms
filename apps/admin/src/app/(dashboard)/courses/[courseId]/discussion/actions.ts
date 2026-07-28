"use server";

// Server actions for the course's discussion settings and moderation queue.

import { revalidatePath } from "next/cache";
import { Discussion } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap, expectOk } from "@/lib/api/server-call";
import type { DiscussionSettings, SetDiscussionSettings, CommentsState } from "@/lib/api/types";

function revalidateDiscussion(): void {
  revalidatePath("/courses/[courseId]/discussion", "page");
}

export async function setDiscussionSettingsAction(
  courseId: string,
  patch: SetDiscussionSettings,
): Promise<DiscussionSettings> {
  ensureConfigured();
  const settings = unwrap(
    await Discussion.setDiscussionSettings({
      path: { courseId },
      body: patch,
      ...(await authHeaders()),
    }),
  );
  revalidateDiscussion();
  return settings;
}

export async function approveCommentAction(commentId: string): Promise<void> {
  ensureConfigured();
  unwrap(
    await Discussion.editComment({
      path: { commentId },
      body: { status: "published" },
      ...(await authHeaders()),
    }),
  );
  revalidateDiscussion();
}

export async function moderateRemoveCommentAction(commentId: string): Promise<void> {
  ensureConfigured();
  const headers = await authHeaders();
  unwrap(await Discussion.moderateRemoveComment({ path: { commentId }, ...headers }));
  // Removing a reported comment settles its reports too, so a handled comment
  // leaves both tabs rather than lingering in the reported one.
  expectOk(await Discussion.dismissCommentReports({ path: { commentId }, ...headers }));
  revalidateDiscussion();
}

export async function restoreCommentAction(commentId: string): Promise<void> {
  ensureConfigured();
  unwrap(
    await Discussion.editComment({
      path: { commentId },
      body: { status: "published" },
      ...(await authHeaders()),
    }),
  );
  revalidateDiscussion();
}

export async function resolveCommentReportsAction(commentId: string): Promise<void> {
  ensureConfigured();
  expectOk(
    await Discussion.dismissCommentReports({ path: { commentId }, ...(await authHeaders()) }),
  );
  revalidateDiscussion();
}

/** null clears the override so the course setting applies again. */
export async function setCommentsStateAction(
  activityId: string,
  state: CommentsState | null,
): Promise<void> {
  ensureConfigured();
  expectOk(
    await Discussion.setActivityCommentsState({
      path: { activityId },
      body: { state },
      ...(await authHeaders()),
    }),
  );
  revalidatePath("/courses/[courseId]/content", "page");
}
