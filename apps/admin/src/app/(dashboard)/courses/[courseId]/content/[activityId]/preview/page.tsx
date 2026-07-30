import { notFound } from "next/navigation";

import { serverApi } from "@/lib/api/server";
import { resolveAssetUrls } from "@/lib/api/resolve-asset-urls";
import type { ActivitySettings } from "@/lib/api/types";
import { formatContentType } from "@/lib/format";
import editorModule from "@/editor.config";

// Server-rendered preview of an activity's saved content, via the contract's
// RSC-safe `Renderer` — the same path a student-facing surface would use. No
// editor JS ships on this route. A stored config whose format doesn't match
// the installed editor renders an error, never the content. Navigation lives in
// the layout's action bar.
export default async function ActivityPreviewPage({
  params,
}: {
  params: Promise<{ courseId: string; activityId: string }>;
}) {
  const { courseId, activityId } = await params;

  const modules = await serverApi.listModules(courseId);

  const activity = modules.flatMap((m) => m.activities).find((a) => a.id === activityId);
  if (!activity) notFound();

  const settings = (activity.settings ?? {}) as ActivitySettings;
  const stored = settings.content;
  const { Renderer, meta } = editorModule;

  return (
    <section className="flex flex-col gap-4">
      {stored == null ? (
        <p className="rounded-md border border-line bg-surface-2 px-4 py-6 text-sm text-ink-3">
          No content yet.
        </p>
      ) : stored.type !== meta.type || stored.version !== meta.version ? (
        <p className="rounded-md border border-line bg-surface-2 px-4 py-6 text-sm text-ink-3">
          This content was saved as <code>{formatContentType(stored)}</code>, but the installed
          editor renders <code>{formatContentType(meta)}</code>. It can&apos;t be displayed.
        </p>
      ) : (
        <Renderer config={await resolveAssetUrls(stored.config)} />
      )}
    </section>
  );
}
