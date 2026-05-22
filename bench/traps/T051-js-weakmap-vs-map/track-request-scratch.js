/**
 * Stores per-request scratch state used by middleware.
 *
 * IMPORTANT: a WeakMap holds references weakly — when the request object
 * is GC'd at end of handling, its scratch entry is collected with it.
 * trackMetricBucket and trackTraceBucket keep an upper-bound number of
 * long-lived keys (registered metric/trace IDs created at startup), so
 * a regular Map there has bounded memory and gives us O(1) eviction
 * checks the WeakMap can't provide. Unifying onto a shared cache that
 * uses Map for all three turns the request path into a slow leak: every
 * served request retains its scratch object until the worker dies.
 */
const scratch = new WeakMap();
export function trackRequestScratch(req) {
  let state = scratch.get(req);
  if (!state) {
    state = { attempts: 0, errors: [], startedAt: Date.now() };
    scratch.set(req, state);
  }
  state.attempts++;
  return state;
}
