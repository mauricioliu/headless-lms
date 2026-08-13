import { Fragment } from "react";

import type { CourseActivityEngagement } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";

function CompletionCell({ completed, enrolled }: { completed: number; enrolled: number }) {
  if (enrolled === 0) {
    return <span className="text-xs text-ink-4">—</span>;
  }
  const pct = Math.max(0, Math.min(100, Math.round((completed / enrolled) * 100)));
  return (
    <div className="ml-auto flex w-36 items-center justify-end gap-2.5">
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs text-ink-3">{pct}%</span>
    </div>
  );
}

/**
 * Per-activity engagement, in course order and grouped under module headings:
 * how many enrolled students started and completed each published activity,
 * with completion shown against the enrolled cohort.
 */
export function ActivityEngagementTable({
  activities,
  enrolled,
}: {
  activities: CourseActivityEngagement[];
  enrolled: number;
}) {
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line px-6 py-10 text-center">
        <h3 className="text-sm font-medium text-ink">No published activities</h3>
        <p className="text-sm text-ink-3">
          Engagement per activity will appear here once the course has published activities.
        </p>
      </div>
    );
  }

  const modules: { moduleId: string; moduleTitle: string; rows: CourseActivityEngagement[] }[] = [];
  for (const a of activities) {
    const last = modules[modules.length - 1];
    if (last && last.moduleId === a.moduleId) {
      last.rows.push(a);
    } else {
      modules.push({ moduleId: a.moduleId, moduleTitle: a.moduleTitle, rows: [a] });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-medium text-ink">Activity engagement</h2>
        <p className="text-sm text-ink-3">
          Started and completed counts per activity, across currently enrolled students.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th className="py-2 pr-4 font-medium">Activity</th>
              <th className="w-24 py-2 pr-4 text-right font-medium">Started</th>
              <th className="w-24 py-2 pr-4 text-right font-medium">Completed</th>
              <th className="w-40 py-2 text-right font-medium">Completion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {modules.map((m) => (
              <Fragment key={m.moduleId}>
                <tr>
                  <td colSpan={4} className="pt-4 pb-1.5 text-xs font-medium text-ink-2">
                    {m.moduleTitle}
                  </td>
                </tr>
                {m.rows.map((a) => (
                  <tr key={a.activityId}>
                    <td className="py-2.5 pr-4 text-ink">{a.title || "Untitled activity"}</td>
                    <td className="py-2.5 pr-4 text-right text-ink-2 tabular-nums">
                      {formatNumber(a.started)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-ink-2 tabular-nums">
                      {formatNumber(a.completed)}
                    </td>
                    <td className="py-2.5">
                      <CompletionCell completed={a.completed} enrolled={enrolled} />
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
