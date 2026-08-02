"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Check, Flag, MessagesSquare, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import type { CommentListItem, CommentStatus, ListParams } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FILTER_PREFIX } from "@/lib/table/parse-list-params";
import { cn } from "@/lib/utils";
import {
  approveCommentAction,
  bulkApproveCommentsAction,
  bulkRemoveCommentsAction,
  moderateRemoveCommentAction,
  replyToCommentAction,
  resolveCommentReportsAction,
  restoreCommentAction,
} from "../actions";
import { ModerationRow } from "./moderation-row";

export interface CommentCounts {
  all: number;
  pending: number;
  published: number;
  removed: number;
  reported: number;
}

const FILTERS: { value: CommentStatus | ""; label: string; count: keyof CommentCounts }[] = [
  { value: "", label: "All", count: "all" },
  { value: "pending", label: "Pending", count: "pending" },
  { value: "published", label: "Published", count: "published" },
  { value: "removed", label: "Removed", count: "removed" },
];

/** Replies come back as their own rows. Nest the ones whose parent is on this
 *  page under it; the rest stand alone rather than vanishing off the bottom. */
function nest(rows: CommentListItem[]): { comment: CommentListItem; replies: CommentListItem[] }[] {
  const ids = new Set(rows.map((r) => r.id));
  const byParent = new Map<string, CommentListItem[]>();
  for (const row of rows) {
    if (row.parentId && ids.has(row.parentId)) {
      byParent.set(row.parentId, [...(byParent.get(row.parentId) ?? []), row]);
    }
  }
  return rows
    .filter((row) => !row.parentId || !ids.has(row.parentId))
    .map((comment) => ({ comment, replies: byParent.get(comment.id) ?? [] }));
}

export function CommentList({
  rows,
  total,
  params,
  counts,
}: {
  rows: CommentListItem[];
  total: number;
  params: ListParams;
  counts: CommentCounts;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const status = params.filters?.status?.[0] ?? "";
  const reported = params.filters?.reported?.[0] ?? "";
  const lastPage = Math.max(1, Math.ceil(total / params.pageSize));
  const nodes = useMemo(() => nest(rows), [rows]);

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
    setSelected(new Set());
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

  // Only the rows that carry a checkbox — a nested reply is moderated through
  // its own parent's card, so selecting all must not silently include it.
  const selectableIds = nodes.map((n) => n.comment.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }

  function toggleOne(id: string, next: boolean) {
    setSelected((prev) => {
      const s = new Set(prev);
      if (next) s.add(id);
      else s.delete(id);
      return s;
    });
  }

  function bulk(label: string, action: (ids: string[]) => Promise<void>) {
    const ids = [...selected];
    run(label, async () => {
      await action(ids);
      setSelected(new Set());
    });
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={counts.all} />
        <Stat label="Pending review" value={counts.pending} tone="warning" />
        <Stat label="Reported" value={counts.reported} tone="danger" />
        <Stat label="Removed" value={counts.removed} tone="muted" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex w-fit items-center rounded-md border border-line p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.value || "all"}
              type="button"
              onClick={() => apply({ [`${FILTER_PREFIX}status`]: f.value || null })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                status === f.value ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              {f.label}
              <span className="text-ink-4 tabular-nums">{counts[f.count]}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              apply({ [`${FILTER_PREFIX}reported`]: reported === "true" ? null : "true" })
            }
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors",
              reported === "true"
                ? "border-danger/40 bg-danger-soft text-danger"
                : "border-line text-ink-3 hover:text-ink",
            )}
          >
            <Flag className="size-3.5" />
            Reported only
          </button>

          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get("q");
              apply({ q: typeof value === "string" ? value.trim() : null });
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-4" />
            <Input
              name="q"
              type="search"
              defaultValue={params.search ?? ""}
              placeholder="Search comments"
              className="w-56 pl-8"
            />
          </form>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="flex min-h-8 items-center justify-between">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-3">
            <Checkbox checked={allSelected} onChange={toggleAll} />
            Select all
          </label>

          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-3">{selected.size} selected</span>
              <Button
                size="sm"
                variant="primary"
                disabled={isPending}
                onClick={() => bulk("Approved", bulkApproveCommentsAction)}
              >
                <Check />
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => bulk("Removed", bulkRemoveCommentsAction)}
              >
                <Trash2 />
                Remove
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                <X />
                <span className="sr-only">Clear selection</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line py-16 text-center">
          <MessagesSquare className="size-8 text-ink-faint" />
          <p className="mt-3 text-sm font-medium text-ink">No comments here</p>
          <p className="mt-1 text-sm text-ink-3">Try a different filter or clear your search.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {nodes.map(({ comment, replies }) => (
            <ModerationRow
              key={comment.id}
              comment={comment}
              replies={replies}
              selected={selected.has(comment.id)}
              pending={isPending}
              onSelect={toggleOne}
              onApprove={(id) => run("Approved", () => approveCommentAction(id))}
              onRemove={(id) => run("Removed", () => moderateRemoveCommentAction(id))}
              onRestore={(id) => run("Restored", () => restoreCommentAction(id))}
              onDismissReports={(id) =>
                run("Reports dismissed", () => resolveCommentReportsAction(id))
              }
              onReply={(id, body, done) =>
                run("Reply posted", async () => {
                  await replyToCommentAction(id, body);
                  done();
                })
              }
            />
          ))}
        </div>
      )}

      {total > params.pageSize && (
        <div className="flex items-center justify-between text-xs text-ink-3">
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

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "danger" | "muted";
}) {
  const toneClass = {
    default: "text-ink",
    warning: "text-warning",
    danger: "text-danger",
    muted: "text-ink-3",
  }[tone];

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className={cn("text-2xl font-semibold tabular-nums", toneClass)}>{value}</div>
      <div className="mt-0.5 text-xs text-ink-3">{label}</div>
    </div>
  );
}
