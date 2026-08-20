/** Small, dependency-free formatters. Numbers stay tabular for tidy tables. */

/** Renders a person for the screen. Purely presentational — the API sends the
 *  names as typed and never a composed one, so joining them is the UI's job.
 *  Falls back to the address, which every person has. */
export function fullName(p: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
}): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ") || (p.email ?? "");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const DAY = 86_400_000;

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * DAY],
  ["month", 30 * DAY],
  ["week", 7 * DAY],
  ["day", DAY],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

const esCL = new Intl.RelativeTimeFormat("es-CL", { numeric: "auto" });

/** Relative time against the current time (e.g. "hace 3 días", "dentro de 2 semanas"). */
export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  for (const [unit, ms] of RELATIVE_UNITS) {
    const n = Math.floor(abs / ms);
    if (n >= 1) return esCL.format(diff < 0 ? -n : n, unit);
  }
  return "ahora mismo";
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatNumber(n: number): string {
  return n.toLocaleString("es-CL");
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** Human label for a content-editor format tag, e.g. "plate v1". */
export function formatContentType(tag: { type: string; version?: number }): string {
  return tag.version != null ? `${tag.type} v${tag.version}` : tag.type;
}
