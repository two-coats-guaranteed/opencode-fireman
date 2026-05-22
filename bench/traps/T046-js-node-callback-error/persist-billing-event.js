/**
 * Writes a billing event to the durable event log.
 *
 * IMPORTANT: this is a node-style callback (err-first). Billing events
 * are revenue-critical — silently dropping a write because the
 * filesystem returned EROFS or ENOSPC produces real money loss.
 * Bubbling err here lets the caller retry / surface to ops.
 * persistDebugEvent and persistMetricEvent are best-effort observability
 * writes where dropping on error is preferable to crashing the
 * callback chain. Unifying onto a shared writer that ignores err
 * re-introduces silent revenue loss on disk pressure.
 */
export function persistBillingEvent(event, cb) {
  fs.writeFile(eventPath(event.id), JSON.stringify(event), (err) => {
    if (err) {
      cb(err);
      return;
    }
    cb(null, event.id);
  });
}
