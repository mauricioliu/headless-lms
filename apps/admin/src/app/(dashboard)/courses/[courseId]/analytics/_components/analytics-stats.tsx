export interface AnalyticsStat {
  label: string;
  value: string;
}

/**
 * KPI row for the course analytics tab — same flat, editorial treatment as the
 * dashboard's StatStrip (hairline left rule, no box), but values are preformatted
 * strings so percentages render alongside counts.
 */
export function AnalyticsStats({ stats }: { stats: AnalyticsStat[] }) {
  return (
    <div className="@container">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 @md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 border-l-2 border-line pl-4">
            <dt className="truncate text-[0.8125rem] text-ink-3">{s.label}</dt>
            <dd className="text-[1.75rem] leading-9 font-semibold tracking-tight text-ink proportional-nums">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
