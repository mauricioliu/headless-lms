import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { CoursesTable } from "./courses-table";

// Courses list page: reads URL params, fetches server-side, renders the table.
export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 20,
    initialSort: [{ id: "updatedAt", desc: true }],
  });

  // The fetch carries its own auth: `authHeaders` gates on the session before
  // any call leaves, so the read is the gate.
  const { rows, total } = await serverApi.listCourses(params);

  return <CoursesTable rows={rows} total={total} params={params} />;
}
