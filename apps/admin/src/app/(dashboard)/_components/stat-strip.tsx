"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface Stat {
  label: string;
  value: number;
}

/** Column count adapts to how many stats a role sees (3 vs 6). */
function colsClass(count: number): string {
  return count <= 3 ? "@md:grid-cols-3" : "@md:grid-cols-3 @4xl:grid-cols-6";
}

/**
 * KPI row, flat and editorial: no card, no border box, no shadow — each stat
 * sits directly on the page behind a 2px hairline left rule. Values are large
 * with proportional figures; labels stay one muted line above.
 */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="@container">
      <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-6", colsClass(stats.length))}>
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 border-l-2 border-line pl-4">
            <dt className="truncate text-[0.8125rem] text-ink-3">{s.label}</dt>
            <dd className="text-[1.75rem] leading-9 font-semibold tracking-tight text-ink proportional-nums">
              {formatNumber(s.value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function StatStripSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="@container">
      <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-6", colsClass(count))}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 border-l-2 border-line pl-4">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-8 w-14" />
          </div>
        ))}
      </dl>
    </div>
  );
}
