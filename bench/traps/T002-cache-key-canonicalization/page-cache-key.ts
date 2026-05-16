import { CacheRequest } from "./types";

export function pageCacheKey(req: CacheRequest): string {
  const parts: string[] = [req.method, req.path];
  for (const [key, value] of Object.entries(req.params)) {
    parts.push(`${key}=${value}`);
  }
  return parts.join("|");
}
