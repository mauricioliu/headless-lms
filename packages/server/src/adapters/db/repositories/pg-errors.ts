/**
 * Postgres unique_violation (23505).
 *
 * The node-postgres driver sometimes wraps the original error (e.g. behind
 * `cause`), so both levels are checked.
 */
export function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown } | undefined)?.code;
  if (code === '23505') {
    return true;
  }
  const cause = (err as { cause?: unknown } | undefined)?.cause;
  const causeCode = (cause as { code?: unknown } | undefined)?.code;
  return causeCode === '23505';
}
