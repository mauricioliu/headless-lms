"use server";

// Server actions for download mutations.

import { revalidatePath } from "next/cache";
import { Downloads } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap, expectOk } from "@/lib/api/server-call";
import type { Download, DownloadAsset } from "@/lib/api/types";

/** Download-level writes surface on both the list and that download's page. */
function revalidateDownload(): void {
  revalidatePath("/downloads");
  revalidatePath("/downloads/[downloadId]", "page");
}

export interface DownloadInput {
  title: string;
  category?: string;
  description?: string;
}

/**
 * A genuine partial update — `title` is optional so a caller changing only
 * one field (e.g. the thumbnail) can omit the rest instead of resending a
 * stale value that would clobber a concurrent edit. Split from `DownloadInput`
 * rather than widening it, since create still requires a title.
 */
export interface DownloadPatch {
  title?: string;
  category?: string;
  description?: string;
  status?: Download["status"];
  thumbnailAssetId?: string | null;
}

export async function createDownloadAction(input: DownloadInput): Promise<Download> {
  ensureConfigured();
  const download = unwrap(
    await Downloads.createDownload({
      body: { title: input.title, description: input.description, category: input.category },
      ...(await authHeaders()),
    }),
  );
  revalidateDownload();
  return download;
}

export async function updateDownloadAction(
  downloadId: string,
  patch: DownloadPatch,
): Promise<Download> {
  ensureConfigured();
  const download = unwrap(
    await Downloads.updateDownload({
      path: { downloadId },
      body: {
        title: patch.title,
        description: patch.description,
        category: patch.category,
        status: patch.status,
        thumbnailAssetId: patch.thumbnailAssetId,
      },
      ...(await authHeaders()),
    }),
  );
  revalidateDownload();
  return download;
}

/** Publish/unpublish — a targeted status write for the row action + optimism. */
export async function setDownloadPublishedAction(
  downloadId: string,
  status: Download["status"],
): Promise<void> {
  ensureConfigured();
  unwrap(
    await Downloads.updateDownload({
      path: { downloadId },
      body: { status },
      ...(await authHeaders()),
    }),
  );
  revalidateDownload();
}

export async function deleteDownloadAction(downloadId: string): Promise<void> {
  ensureConfigured();
  expectOk(await Downloads.deleteDownload({ path: { downloadId }, ...(await authHeaders()) }));
  revalidateDownload();
}

export async function addDownloadAssetAction(
  downloadId: string,
  assetId: string,
  displayName?: string,
): Promise<DownloadAsset[]> {
  ensureConfigured();
  const assets = unwrap(
    await Downloads.addDownloadAsset({
      path: { downloadId },
      body: { assetId, displayName },
      ...(await authHeaders()),
    }),
  );
  revalidateDownload();
  return assets;
}

export async function renameDownloadAssetAction(
  downloadId: string,
  assetId: string,
  displayName: string | null,
): Promise<DownloadAsset[]> {
  ensureConfigured();
  const assets = unwrap(
    await Downloads.renameDownloadAsset({
      path: { downloadId, assetId },
      body: { displayName },
      ...(await authHeaders()),
    }),
  );
  revalidateDownload();
  return assets;
}

export async function removeDownloadAssetAction(
  downloadId: string,
  assetId: string,
): Promise<DownloadAsset[]> {
  ensureConfigured();
  const assets = unwrap(
    await Downloads.removeDownloadAsset({
      path: { downloadId, assetId },
      ...(await authHeaders()),
    }),
  );
  revalidateDownload();
  return assets;
}

export async function reorderDownloadAssetsAction(
  downloadId: string,
  assetIds: string[],
): Promise<DownloadAsset[]> {
  ensureConfigured();
  const assets = unwrap(
    await Downloads.reorderDownloadAssets({
      path: { downloadId },
      body: { assetIds },
      ...(await authHeaders()),
    }),
  );
  revalidateDownload();
  return assets;
}
