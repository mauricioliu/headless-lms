import Link from "next/link";
import { Flag } from "lucide-react";

import type { CommentStatus } from "@/lib/api/types";
import { FILTER_PREFIX } from "@/lib/table/parse-list-params";
import { cn } from "@/lib/utils";
import { listHref, type RawSearchParams } from "../_lib/list-url";
import type { CommentCounts } from "./comment-stats";

const FILTERS: { value: CommentStatus | ""; label: string; count: keyof CommentCounts }[] = [
  { value: "", label: "All", count: "all" },
  { value: "pending", label: "Pending", count: "pending" },
  { value: "published", label: "Published", count: "published" },
  { value: "removed", label: "Removed", count: "removed" },
];

const STATUS_KEY = `${FILTER_PREFIX}status`;
const REPORTED_KEY = `${FILTER_PREFIX}reported`;

/** Status tabs + the reported-only toggle. Every control is a link to the same
 *  route with different params — the Server Component refetches off the URL. */
export function CommentFilters({
  path,
  search,
  status,
  reported,
  counts,
}: {
  path: string;
  search: RawSearchParams;
  status: string;
  reported: string;
  counts: CommentCounts;
}) {
  return (
    <>
      <div className="inline-flex w-fit items-center rounded-md border border-line p-0.5">
        {FILTERS.map((f) => (
          <Link
            key={f.value || "all"}
            href={listHref(path, search, { [STATUS_KEY]: f.value || null })}
            aria-current={status === f.value ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              status === f.value ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {f.label}
            <span className="text-ink-4 tabular-nums">{counts[f.count]}</span>
          </Link>
        ))}
      </div>

      <Link
        href={listHref(path, search, { [REPORTED_KEY]: reported === "true" ? null : "true" })}
        aria-pressed={reported === "true"}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors",
          reported === "true"
            ? "border-danger/40 bg-danger-soft text-danger"
            : "border-line text-ink-3 hover:text-ink",
        )}
      >
        <Flag className="size-3.5" />
        Reported only
      </Link>
    </>
  );
}
