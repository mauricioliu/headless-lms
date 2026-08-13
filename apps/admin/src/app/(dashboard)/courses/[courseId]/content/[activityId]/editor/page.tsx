import { notFound } from "next/navigation";

import { serverApi } from "@/lib/api/server";
import type { ActivitySettings } from "@/lib/api/types";
import { formatContentType } from "@/lib/format";
import editorModule from "@/editor.config";

import { ActivityEditorProvider } from "./editor-context";
import { EditorShell } from "./editor-shell";

// Content view for one activity. RSC: loads the stored config blob and hands
// it to the client shell. Which editor renders is decided by `@/editor.config`
// (the per-deployment swap point) — this route never imports an editor package.
// The back link, view switch, and Save button live in the layout's action bar.
export default async function ActivityEditorPage({
  params,
}: {
  params: Promise<{ courseId: string; activityId: string }>;
}) {
  const { courseId, activityId } = await params;

  const modules = await serverApi.moduleTree(courseId);

  const parent = modules.find((m) => m.activities.some((a) => a.id === activityId));
  const activity = parent?.activities.find((a) => a.id === activityId);
  if (!parent || !activity) notFound();

  const settings = (activity.settings ?? {}) as ActivitySettings;
  const stored = settings.content;
  const { meta } = editorModule;

  // Only feed the editor configs it produced; a foreign blob (different type
  // or breaking version) is left untouched on disk and the editor starts
  // empty (saving replaces it).
  const foreignFormat =
    stored != null && (stored.type !== meta.type || stored.version !== meta.version);
  // Media URLs in stored content are expired presigns; the editor resolves
  // fresh ones per node through its `resolveAssetUrl` callback (EditorShell).
  const initialConfig = stored != null && !foreignFormat ? stored.config : null;

  return (
    <section className="editor-container flex flex-col gap-4">
      <ActivityEditorProvider
        courseId={courseId}
        moduleId={parent.id}
        activityId={activityId}
        initialConfig={initialConfig}
      >
        {foreignFormat ? (
          <p className="rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-ink-3">
            This activity has content saved as <code>{formatContentType(stored!)}</code>, which the
            installed editor ({formatContentType(meta)}) can&apos;t open. Saving will replace it.
          </p>
        ) : null}

        <EditorShell />
      </ActivityEditorProvider>
    </section>
  );
}
