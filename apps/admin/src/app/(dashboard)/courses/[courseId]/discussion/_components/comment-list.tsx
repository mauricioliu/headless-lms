"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";

import type { CommentListItem, CommentStatus, ListParams } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FILTER_PREFIX } from "@/lib/table/parse-list-params";
import { relativeTime } from "@/lib/format";
import {
  approveCommentAction,
  moderateRemoveCommentAction,
  resolveCommentReportsAction,
  restoreCommentAction,
} from "../actions";

const STATUSES: { value: CommentStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "published", label: "Published" },
  { value: "removed", label: "Removed" },
];

const STATUS_VARIANT: Record<CommentStatus, "warning" | "success" | "neutral"> = {
  pending: "warning",
  published: "success",
  removed: "neutral",
};

export function CommentList({
  rows,
  total,
  params,
}: {
  rows: CommentListItem[];
  total: number;
  params: ListParams;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const status = params.filters?.status?.[0] ?? "";
  const reported = params.filters?.reported?.[0] ?? "";
  const lastPage = Math.max(1, Math.ceil(total / params.pageSize));

  /** Every control writes the URL; the Server Component refetches off it. Any
   *  filter change resets to page 1 — page 4 of the old filter means nothing. */
  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    }
    if (!("page" in changes)) {
      next.delete("page");
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  function run(label: string, action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action();
        toast.success(label);
      } catch (err) {
        toast.error("Could not complete", { description: (err as Error).message });
      }
    });
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Comments</h2>

        <div className="flex flex-wrap items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get("q");
              apply({ q: typeof value === "string" ? value.trim() : null });
            }}
          >
            <Input
              name="q"
              type="search"
              defaultValue={params.search ?? ""}
              placeholder="Search comments"
              className="w-56"
            />
          </form>

          <div className="inline-flex rounded-md border border-line p-0.5">
            {STATUSES.map((s) => (
              <button
                key={s.value || "all"}
                type="button"
                onClick={() => apply({ [`${FILTER_PREFIX}status`]: s.value || null })}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  status === s.value ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              apply({ [`${FILTER_PREFIX}reported`]: reported === "true" ? null : "true" })
            }
            className={`rounded-md border border-line px-3 py-1.5 text-xs font-medium ${
              reported === "true" ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink"
            }`}
          >
            Reported only
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">No comments match these filters.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className="p-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-ink-3">
                <span className="text-sm font-semibold text-ink">{row.author.name}</span>
                <span>{row.authorEmail}</span>
                <span>·</span>
                <span>{row.activityTitle}</span>
                <span>·</span>
                <span>{relativeTime(row.createdAt)}</span>
                <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                {row.reports.length > 0 && (
                  <Badge variant="danger">
                    {row.reports.length} {row.reports.length === 1 ? "report" : "reports"}
                  </Badge>
                )}
              </div>

              <p className="mt-2 text-sm whitespace-pre-wrap text-ink">{row.body}</p>

              {row.reports.length > 0 && (
                <ul className="mt-3 space-y-1 border-l-2 border-line pl-3">
                  {row.reports.map((report, i) => (
                    <li key={i} className="text-xs text-ink-3">
                      <span className="font-medium text-ink">{report.reporter.name}</span>
                      {report.reason ? ` — ${report.reason}` : " flagged this"}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {row.status === "pending" && (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={isPending}
                    onClick={() => run("Approved", () => approveCommentAction(row.id))}
                  >
                    Approve
                  </Button>
                )}
                {row.status === "removed" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => run("Restored", () => restoreCommentAction(row.id))}
                  >
                    Restore
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => run("Removed", () => moderateRemoveCommentAction(row.id))}
                  >
                    Remove
                  </Button>
                )}
                {row.reports.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() =>
                      run("Reports dismissed", () => resolveCommentReportsAction(row.id))
                    }
                  >
                    Dismiss reports
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {total > params.pageSize && (
        <div className="mt-4 flex items-center justify-between text-xs text-ink-3">
          <span>
            Page {params.page} of {lastPage} · {total} comments
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={params.page <= 1}
              onClick={() => apply({ page: String(params.page - 1) })}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={params.page >= lastPage}
              onClick={() => apply({ page: String(params.page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
