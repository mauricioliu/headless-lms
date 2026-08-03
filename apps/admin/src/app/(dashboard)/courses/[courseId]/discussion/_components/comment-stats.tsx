import { cn } from "@/lib/utils";

export interface CommentCounts {
  all: number;
  pending: number;
  published: number;
  removed: number;
  reported: number;
}

const TONES = {
  default: "text-ink",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-ink-3",
} as const;

export function CommentStats({ counts }: { counts: CommentCounts }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Total" value={counts.all} />
      <Stat label="Pending review" value={counts.pending} tone="warning" />
      <Stat label="Reported" value={counts.reported} tone="danger" />
      <Stat label="Removed" value={counts.removed} tone="muted" />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className={cn("text-2xl font-semibold tabular-nums", TONES[tone])}>{value}</div>
      <div className="mt-0.5 text-xs text-ink-3">{label}</div>
    </div>
  );
}
