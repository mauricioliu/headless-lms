import type { ReactNode } from "react";
import { requireAuth } from "@/lib/auth/server-session";
import { isManager } from "@/lib/roles";
import { serverApi } from "@/lib/api/server";
import { ForbiddenView } from "@/components/full-page-states";

import { DownloadHeader } from "./_components/download-header";

// Shared shell for a single download: back link, header, and the tab nav. Each
// tab is its own route segment (assets / details / access) rendered as
// `children`. Managers only — instructor download scoping isn't wired yet.
export default async function DownloadLayout({
  params,
  children,
}: {
  params: Promise<{ downloadId: string }>;
  children: ReactNode;
}) {
  const { downloadId } = await params;

  const downloadPromise = serverApi.getDownload(downloadId);
  const statsPromise = serverApi.downloadStats(downloadId);
  const session = await requireAuth(downloadPromise);
  if (!isManager(session.role)) {
    void downloadPromise.catch(() => {});
    void statsPromise.catch(() => {});
    return <ForbiddenView description="You don't have access to manage this download." />;
  }
  const [download, stats] = await Promise.all([downloadPromise, statsPromise]);

  return (
    <div className="flex flex-col gap-8">
      <DownloadHeader download={download} stats={stats} />
      {children}
    </div>
  );
}
