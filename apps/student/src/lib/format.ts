// Display formatting helpers.

/** "viernes · 12 de agosto" */
export function dateLabel(d = new Date()): string {
  const day = d.toLocaleDateString("es-CL", { weekday: "long" });
  const md = d.toLocaleDateString("es-CL", { month: "long", day: "numeric" });
  return `${day} · ${md}`;
}

/** "Buenas noches" según la hora local. */
export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Buenos días";
  if (h < 18) return "Buenas tardes";
  return "Buenas noches";
}

export function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

/** Renders a person for the screen. Purely presentational — the API sends the
 *  names as typed and never a composed one, so joining them is the UI's job. */
export function fullName(p: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
}): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ") || (p.email ?? "");
}

/** Up-to-two-letter initials from a display name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Compact age of a timestamp, as a comment byline wants it: "ahora mismo",
 *  "hace 12 min", "hace 3 h", "hace 5 d", then a plain date once it stops
 *  being news. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < MINUTE) return "ahora mismo";
  if (diff < HOUR) return `hace ${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY) return `hace ${Math.floor(diff / HOUR)} h`;
  if (diff < 7 * DAY) return `hace ${Math.floor(diff / DAY)} d`;
  return new Date(then).toLocaleDateString("es-CL", { month: "short", day: "numeric" });
}

/** "4.2 MB" — human-readable byte size. */
export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}
