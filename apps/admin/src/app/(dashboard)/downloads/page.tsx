import { Download } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { requireAuth } from "@/lib/auth/server-session";

// Placeholder route behind the Content › Downloads nav entry. Nothing is wired
// to the API yet — it exists so the submenu link resolves.
export default async function DownloadsPage() {
  await requireAuth();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Downloads" subtitle="Downloadable files offered as content." />
      <div className="rounded-lg border border-line bg-surface px-3 py-16">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center">
          <div className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-3">
            <Download className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-medium text-ink">Downloads aren&apos;t available yet</p>
            <p className="text-sm text-ink-3 text-pretty">
              This section is a placeholder. There&apos;s nothing behind it for now.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
