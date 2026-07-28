import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { AccessGrantsList } from "@/components/access-grants-list";

// Access tab: the students granted access to this download (entitlements).
// Read only here — grants are managed from the Entitlements area.
export default async function DownloadAccessTab({
  params,
}: {
  params: Promise<{ downloadId: string }>;
}) {
  const { downloadId } = await params;

  const grantsPromise = serverApi.contentEntitlements(downloadId);
  await requireAuth(grantsPromise);
  const grants = await grantsPromise;

  return (
    <AccessGrantsList
      grants={grants}
      emptyDescription="Students granted access to this download will appear here."
    />
  );
}
