"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Eye, PenLine, SlidersHorizontal, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useActivityBar } from "./activity-bar-context";

// Three zones: back + title, the view switch, and Save for the view on screen.
const VIEWS: { segment: string; label: string; icon: LucideIcon }[] = [
  { segment: "editor", label: "Content", icon: PenLine },
  { segment: "settings", label: "Settings", icon: SlidersHorizontal },
  { segment: "preview", label: "Preview", icon: Eye },
];

export function ActivityBar({
  courseId,
  activityId,
  title,
}: {
  courseId: string;
  activityId: string;
  title: string;
}) {
  const pathname = usePathname();
  const { save } = useActivityBar();
  const base = `/courses/${courseId}/content/${activityId}`;

  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Back to curriculum">
          <Link href={`/courses/${courseId}/content`}>
            <ArrowLeft />
          </Link>
        </Button>
        <h2 className="min-w-0 truncate text-sm font-medium text-ink">{title}</h2>
      </div>

      <nav
        aria-label="Activity views"
        className="flex shrink-0 items-center gap-0.5 rounded-md border border-line bg-surface-2 p-0.5"
      >
        {VIEWS.map(({ segment, label, icon: Icon }) => {
          const href = `${base}/${segment}`;
          const active = pathname === href;
          return (
            <Link
              key={segment}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-xs font-medium whitespace-nowrap outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring/40",
                active
                  ? "bg-surface text-ink shadow-sm ring-1 ring-ink/5"
                  : "text-ink-3 hover:text-ink",
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-1 items-center justify-end gap-3">
        {save?.dirty ? <span className="text-xs text-ink-4">Unsaved changes</span> : null}
        {save ? (
          <Button
            variant="primary"
            size="sm"
            disabled={save.saving}
            onClick={() => void save.save()}
          >
            {save.saving ? "Saving…" : "Save"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
