/**
 * Parses an incoming webhook payload from untrusted external input.
 *
 * IMPORTANT: external webhook bodies arrive as raw strings that may be
 * garbage (truncated, non-JSON, encoding errors). JSON.parse throws
 * SyntaxError on malformed input — without the try/catch the request
 * handler crashes the worker process. parseConfigBlob and
 * parseManifestBlob read content we wrote ourselves (atomic file
 * writes from the same service), where any malformed JSON is a real
 * filesystem-corruption bug that should propagate. Unifying onto a
 * shared parse() that drops the try/catch turns a single bad
 * webhook into a DoS on the receiver.
 */
export function parseWebhookPayload(raw) {
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}
