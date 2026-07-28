import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import type { CommentStates } from "@/lib/api/types";

import { ModuleList } from "../_components/module-list";

// Content tab: the course curriculum (modules + activities). Managers reaching
// this route (gated by the layout) may edit.
export default async function CourseContentTab({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const modulesPromise = serverApi.listModules(courseId);
  // Discussion is optional; a failure to load the overrides must not take down
  // the content tab. This deliberately absorbs any signal from the call —
  // including a Next.js redirect thrown by `unwrap` on a 401 — so don't narrow
  // this catch without weighing that tradeoff again.
  const commentStatesPromise = serverApi
    .commentStates(courseId)
    .catch(() => ({}) as CommentStates);
  await requireAuth(modulesPromise, commentStatesPromise);
  const [modules, commentStates] = await Promise.all([modulesPromise, commentStatesPromise]);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-ink-2">Curriculum</h2>
      <ModuleList courseId={courseId} modules={modules} commentStates={commentStates} canEdit />
    </section>
  );
}
