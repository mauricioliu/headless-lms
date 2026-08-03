// Pure helpers for the moderation queue: the URL vocabulary its navigation
// controls link to, and the parent/reply nesting the list renders.
import type { CommentListItem } from "@/lib/api/types";

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function basePath(courseId: string): string {
  return `/courses/${courseId}/discussion`;
}

/**
 * The href for the current view with `changes` applied. A null value drops the
 * key. Any change other than an explicit `page` resets to page 1 — page 4 of the
 * old filter means nothing. Unrelated params (sort, pageSize) are carried over.
 */
export function listHref(
  path: string,
  current: RawSearchParams,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (value == null) continue;
    for (const one of Array.isArray(value) ? value : [value]) next.append(key, one);
  }
  for (const [key, value] of Object.entries(changes)) {
    next.delete(key);
    if (value) next.set(key, value);
  }
  if (!("page" in changes)) next.delete("page");
  const qs = next.toString();
  return qs ? `${path}?${qs}` : path;
}

export interface CommentNode {
  comment: CommentListItem;
  replies: CommentListItem[];
}

/** Replies come back as their own rows. Nest the ones whose parent is on this
 *  page under it; the rest stand alone rather than vanishing off the bottom. */
export function nest(rows: CommentListItem[]): CommentNode[] {
  const ids = new Set(rows.map((r) => r.id));
  const byParent = new Map<string, CommentListItem[]>();
  for (const row of rows) {
    if (row.parentId && ids.has(row.parentId)) {
      byParent.set(row.parentId, [...(byParent.get(row.parentId) ?? []), row]);
    }
  }
  return rows
    .filter((row) => !row.parentId || !ids.has(row.parentId))
    .map((comment) => ({ comment, replies: byParent.get(comment.id) ?? [] }));
}
