import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { DownloadAssetsPanel } from "../_components/download-assets-panel";

// Files tab: the ordered asset list for the download. Segment is `assets`
// (matches the table/API); the visible tab label is "Files".
export default async function DownloadAssetsTab({
  params,
}: {
  params: Promise<{ downloadId: string }>;
}) {
  const { downloadId } = await params;

  const assetsPromise = serverApi.listDownloadAssets(downloadId);
  await requireAuth(assetsPromise);
  const assets = await assetsPromise;

  return <DownloadAssetsPanel downloadId={downloadId} assets={assets} />;
}
