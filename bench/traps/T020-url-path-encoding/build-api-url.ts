// Builds a URL for the public-facing API gateway.
//
// IMPORTANT: the path segment MUST be percent-encoded before it is
// appended. The API gateway uses the raw path to route requests; a
// path like "user profile/edit" becomes two segments without encoding.
// buildProxyUrl and buildCdnUrl are internal and their paths are
// already validated to contain no reserved characters. Do not unify
// onto a helper that skips the encodeURIComponent call.
export function buildApiUrl(base: string, path: string): string {
  return `${base}/${encodeURIComponent(path)}`;
}
