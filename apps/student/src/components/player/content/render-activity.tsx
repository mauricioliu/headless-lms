import type { ReactNode } from "react";

import editorModule from "@/editor.config";
import { resolveAssetUrl } from "@/lib/api/asset-url";
import type { ActivityContent } from "@/lib/api/types";

// Renders an activity's stored content on the SERVER via the installed editor's
// RSC-safe `Renderer`, guarded by type/version (mirrors the admin preview). The
// result is handed to the client player as ready-made nodes, so the Plate static
// tree renders once on the server and is never re-executed on the client — Plate
// assigns non-deterministic node ids per `createSlateEditor`, so re-running it on
// the client would produce a hydration mismatch. No editor JS ships either; a
// config in a foreign format renders a notice, never the content.
export function renderActivityContent(content: ActivityContent | null): ReactNode {
  const { Renderer, meta } = editorModule;

  if (content == null) {
    return <div className="mx-auto max-w-[720px] px-6 py-16 text-ink-3">Aún no hay contenido.</div>;
  }
  if (content.type !== meta.type || content.version !== meta.version) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-16 text-ink-3">
        Este contenido se guardó en un formato que el reproductor no puede mostrar.
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-[760px] px-6 py-10">
      <Renderer config={content.config} resolveAssetUrl={resolveAssetUrl} />
    </div>
  );
}
