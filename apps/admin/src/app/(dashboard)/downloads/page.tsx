import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { DownloadsTable } from "./downloads-table";

// Downloads list page: reads URL params, fetches server-side, renders the table.
export default async function DownloadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 20,
    initialSort: [{ id: "updatedAt", desc: true }],
  });

  const { rows, total } = await serverApi.listDownloads(params);

  return <DownloadsTable rows={rows} total={total} params={params} />;
}
