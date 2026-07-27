/**
 * Splits a display name into first/last on the first space.
 *
 * The person row (`users`) carries one `display_name`, while a participation
 * carries `first_name`/`last_name`. This is the single place that bridges the
 * two, so a participation created at invite acceptance is named the same way
 * one created from the admin roster is.
 *
 * A single word leaves `last` empty; everything after the first space is the
 * surname, so compound surnames survive intact.
 */
export function splitName(displayName: string): { first: string; last: string } {
  const trimmed = displayName.trim();
  const i = trimmed.indexOf(' ');
  return i === -1
    ? { first: trimmed, last: '' }
    : { first: trimmed.slice(0, i), last: trimmed.slice(i + 1) };
}
