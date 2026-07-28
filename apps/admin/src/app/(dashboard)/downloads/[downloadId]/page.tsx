import { redirect } from "next/navigation";

// The bare download URL has no content of its own — send it to the files tab,
// the surface an author wants first.
export default async function DownloadIndex({
  params,
}: {
  params: Promise<{ downloadId: string }>;
}) {
  const { downloadId } = await params;
  redirect(`/downloads/${downloadId}/assets`);
}
