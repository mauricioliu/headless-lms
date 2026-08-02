"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List } from "lucide-react";

import { SegmentedControl } from "@/components/primitives/segmented-control";
import { dashboardHref, type DashboardParams, type SortValue } from "@/lib/dashboard";

/**
 * Dashboard toolbar (handoff §4): filter segmented · sort · grid/list toggle.
 *
 * The view lives in the URL, not in component state — the page re-renders on
 * the server for every change, so this stays a leaf that only writes. Current
 * values arrive as props (no `useSearchParams`), and `useOptimistic` keeps the
 * control responsive while the server round-trip is in flight.
 */
export function Toolbar(params: DashboardParams) {
  const router = useRouter();
  const [view, setView] = useOptimistic(params);
  const [, startTransition] = useTransition();

  const go = (patch: Partial<DashboardParams>) => {
    const next = { ...view, ...patch };
    startTransition(() => {
      setView(next);
      router.push(dashboardHref(next), { scroll: false });
    });
  };

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <SegmentedControl
        value={view.filter}
        onChange={(filter) => go({ filter })}
        options={[
          { value: "all", label: "All" },
          { value: "inprogress", label: "In progress" },
          { value: "completed", label: "Completed" },
        ]}
      />
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-[7px] text-[13px] text-ink-3">
          <span>Sort</span>
          <select
            value={view.sort}
            onChange={(e) => go({ sort: e.target.value as SortValue })}
            className="cursor-pointer rounded-[9px] border border-line bg-surface px-3 py-[7px] text-[13px] text-ink-btn"
          >
            <option value="recent">Recently accessed</option>
            <option value="progress">Progress</option>
            <option value="title">Title (A–Z)</option>
          </select>
        </label>
        <SegmentedControl
          size="icon"
          value={view.layout}
          onChange={(layout) => go({ layout })}
          options={[
            {
              value: "grid",
              title: "Grid",
              icon: <LayoutGrid className="size-[17px]" strokeWidth={1.7} />,
            },
            {
              value: "list",
              title: "List",
              icon: <List className="size-[17px]" strokeWidth={1.7} />,
            },
          ]}
        />
      </div>
    </div>
  );
}
