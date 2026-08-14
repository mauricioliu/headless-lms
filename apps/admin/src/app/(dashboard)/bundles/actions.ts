"use server";

// Server actions for bundle mutations.

import { revalidatePath } from "next/cache";
import { Content } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type { Bundle } from "@/lib/api/types";

function revalidateBundles(): void {
  revalidatePath("/bundles");
}

export async function createBundleAction(input: {
  name: string;
  contentIds?: string[];
}): Promise<Bundle> {
  const bundle = await Content.createBundle(
    { name: input.name, contentIds: input.contentIds },
    await authHeaders(),
  );
  revalidateBundles();
  return bundle;
}

/** Rename + item diff in one submit — the dialog sends what changed. */
export async function updateBundleAction(
  bundleId: string,
  patch: { name?: string; addContentIds?: string[]; removeContentIds?: string[] },
): Promise<void> {
  const headers = await authHeaders();
  if (patch.name !== undefined) {
    await Content.updateBundle({ bundleId, name: patch.name }, headers);
  }
  for (const contentId of patch.addContentIds ?? []) {
    await Content.addBundleItem({ bundleId, contentId }, headers);
  }
  for (const contentId of patch.removeContentIds ?? []) {
    await Content.removeBundleItem({ bundleId, contentId }, headers);
  }
  revalidateBundles();
}

export async function deleteBundleAction(bundleId: string): Promise<void> {
  await Content.deleteBundle({ bundleId }, await authHeaders());
  revalidateBundles();
}
