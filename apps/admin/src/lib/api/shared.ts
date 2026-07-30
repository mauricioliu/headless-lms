/**
 * Isomorphic API helpers. `toQuery` lives here so the browser and the SSR
 * prefetch serialize queries **identically** — a divergent `toQuery` would make
 * the client's query key miss the server-hydrated cache and refetch.
 */

import type { ListParams } from "./types";

/**
 * Map the dashboard table's params onto the SDK's typed query.
 *
 * Two intentional narrowings vs. the table's capabilities: the API takes a
 * single `sort` field (`-field` for desc), so only the primary sort column is
 * sent; and faceted filters are single-valued server-side, so the first
 * selected value per facet is applied.
 */
export function toQuery(params: ListParams, facetKeys: readonly string[]): Record<string, unknown> {
  const sort = params.sort?.[0];
  const q: Record<string, unknown> = {
    page: params.page,
    pageSize: params.pageSize,
    search: params.search || undefined,
    sort: sort ? `${sort.desc ? "-" : ""}${sort.id}` : undefined,
  };
  for (const key of facetKeys) {
    const values = params.filters?.[key];
    if (values?.length) q[key] = values[0];
  }
  return q;
}
