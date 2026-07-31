// Comments tab: the course's comments, filtered. The API scopes by course, so
// this tab is the whole moderation surface — there is no global inbox. Comment
// settings live on the Settings tab.
import { serverApi } from "@/lib/api/server";
import type { ListParams } from "@/lib/api/types";
import { parseListParams } from "@/lib/table/parse-list-params";

import { CommentList } from "./_components/comment-list";

/** The queue's headline numbers. The list endpoint is the only count there is,
 *  so each one is a one-row page read for its `total` — cheap, and it keeps the
 *  tallies honest against whatever the filters are actually matching. */
function countParams(base: ListParams, filters: Record<string, string[]>): ListParams {
  return { ...base, page: 1, pageSize: 1, filters };
}

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

  const [page, all, pending, published, removed, reported] = await Promise.all([
    serverApi.listComments(courseId, listParams),
    serverApi.listComments(courseId, countParams(listParams, {})),
    serverApi.listComments(courseId, countParams(listParams, { status: ["pending"] })),
    serverApi.listComments(courseId, countParams(listParams, { status: ["published"] })),
    serverApi.listComments(courseId, countParams(listParams, { status: ["removed"] })),
    serverApi.listComments(courseId, countParams(listParams, { reported: ["true"] })),
  ]);

  return (
    <CommentList
      rows={page.rows}
      total={page.total}
      params={listParams}
      counts={{
        all: all.total,
        pending: pending.total,
        published: published.total,
        removed: removed.total,
        reported: reported.total,
      }}
    />
  );
}
