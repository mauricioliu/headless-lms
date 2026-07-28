// Comments tab: the course's comments, filtered. The API scopes by course, so
// this tab is the whole moderation surface — there is no global inbox. Comment
// settings live on the Settings tab.
import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { CommentList } from "./_components/comment-list";

export default async function CourseCommentsTab({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { courseId } = await params;
  const listParams = parseListParams(await searchParams, {
    pageSize: 20,
    initialSort: [{ id: "createdAt", desc: true }],
  });

  const pagePromise = serverApi.listComments(courseId, listParams);
  await requireAuth(pagePromise);
  const { rows, total } = await pagePromise;

  return <CommentList rows={rows} total={total} params={listParams} />;
}
