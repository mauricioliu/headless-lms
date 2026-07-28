// Comments tab: the moderation queue for one course. The queue is already
// course-scoped by the API, so this tab is the whole moderation surface — there
// is no global inbox. Comment settings live on the Settings tab.
import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { QueueList, type QueueKind } from "./_components/queue-list";

export default async function CourseCommentsTab({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { courseId } = await params;
  const { kind: rawKind } = await searchParams;
  const kind: QueueKind = rawKind === "reported" ? "reported" : "pending";

  const queuePromise = serverApi.moderationQueue(courseId, kind);
  await requireAuth(queuePromise);
  const entries = await queuePromise;

  return <QueueList kind={kind} entries={entries} />;
}
