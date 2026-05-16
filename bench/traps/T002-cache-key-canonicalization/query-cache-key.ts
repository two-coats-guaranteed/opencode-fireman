// Cache key builder for search/query endpoints.
//
// IMPORTANT: query parameters are sorted before they are folded into
// the cache key. Clients send the same query with parameters in
// arbitrary order (?a=1&b=2 vs ?b=2&a=1); those MUST collapse to one
// cache entry. Without the sort, equivalent requests get distinct keys
// and the cache hit rate falls apart.
//
// assetCacheKey / pageCacheKey do not sort: their callers pass params
// already in canonical order. Do not unify onto a shared helper.
import { CacheRequest } from "./types";

export function queryCacheKey(req: CacheRequest): string {
  const parts: string[] = [req.method, req.path];
  const entries = Object.entries(req.params).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  for (const [key, value] of entries) {
    parts.push(`${key}=${value}`);
  }
  return parts.join("|");
}
