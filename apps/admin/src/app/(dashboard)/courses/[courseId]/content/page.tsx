import { serverApi } from "@/lib/api/server";

import { ModuleList } from "../_components/module-list";

// Content tab: the course curriculum (modules + activities). Managers reaching
// this route (gated by the layout) may edit.
export default async function CourseContentTab({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const modules = await serverApi.listModules(courseId);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-ink-2">Curriculum</h2>
      <ModuleList courseId={courseId} modules={modules} canEdit />
    </section>
  );
}
