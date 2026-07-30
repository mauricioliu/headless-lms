import { serverApi } from "@/lib/api/server";

import { DownloadDetailsForm } from "../_components/download-details-form";

// Details tab: edit download metadata (title, category, description, thumbnail).
export default async function DownloadDetailsTab({
  params,
}: {
  params: Promise<{ downloadId: string }>;
}) {
  const { downloadId } = await params;

  const download = await serverApi.getDownload(downloadId);

  return <DownloadDetailsForm download={download} />;
}
