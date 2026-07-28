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
  patch: DownloadInput & { status?: Download["status"]; thumbnailAssetId?: string | null },
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
