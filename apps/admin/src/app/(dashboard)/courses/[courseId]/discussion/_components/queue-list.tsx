"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";

import type { QueueEntry } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { relativeTime } from "@/lib/format";
import {
  approveCommentAction,
  moderateRemoveCommentAction,
  resolveCommentReportsAction,
} from "../actions";

export type QueueKind = "pending" | "reported";

export function QueueList({ kind, entries }: { kind: QueueKind; entries: QueueEntry[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  function select(next: QueueKind) {
    const search = new URLSearchParams(params.toString());
    search.set("kind", next);
    router.push(`${pathname}?${search.toString()}`);
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
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Queue</h2>
        <div className="inline-flex rounded-md border border-line p-0.5">
          {(["pending", "reported"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => select(k)}
              className={`rounded px-3 py-1 text-xs font-medium capitalize ${
                kind === k ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">
          {kind === "pending"
            ? "Nothing is waiting for review."
            : "No comments have been reported."}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {entries.map((entry) => (
            <Card key={entry.comment.id} className="p-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-ink-3">
                <span className="text-sm font-semibold text-ink">{entry.author.name}</span>
                <span>{entry.authorEmail}</span>
                <span>·</span>
                <span>{entry.activityTitle}</span>
                <span>·</span>
                <span>{relativeTime(entry.comment.createdAt)}</span>
              </div>

              <p className="mt-2 text-sm whitespace-pre-wrap text-ink">{entry.comment.body}</p>

              {entry.reports.length > 0 && (
                <ul className="mt-3 space-y-1 border-l-2 border-line pl-3">
                  {entry.reports.map((report, i) => (
                    <li key={i} className="text-xs text-ink-3">
                      <span className="font-medium text-ink">{report.reporter.name}</span>
                      {report.reason ? ` — ${report.reason}` : " flagged this"}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {kind === "pending" && (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={isPending}
                    onClick={() =>
                      run("Approved", () => approveCommentAction(entry.comment.id))
                    }
                  >
                    Approve
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={isPending}
                  onClick={() =>
                    run("Removed", () => moderateRemoveCommentAction(entry.comment.id))
                  }
                >
                  Remove
                </Button>
                {kind === "reported" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() =>
                      run("Reports dismissed", () =>
                        resolveCommentReportsAction(entry.comment.id),
                      )
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
    </section>
  );
}
