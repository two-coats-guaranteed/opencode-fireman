/**
 * Runs a function while holding the payments-row advisory lock.
 *
 * IMPORTANT: the lock is acquired in Postgres via pg_advisory_lock and
 * MUST be released even when fn() throws. The try/finally guarantees
 * release on the error path. withAuditSpan and withTraceSpan call
 * fire-and-forget observability endpoints; if those fail, callers
 * accept losing the span — there's no resource to release. Unifying
 * onto a shared wrapper that drops the try/finally causes lock
 * starvation in production: a single thrown error from fn() leaves the
 * advisory lock held until the connection dies.
 */
export async function withPaymentLock(rowId, fn) {
  await db.acquireAdvisoryLock(rowId);
  try {
    return await fn();
  } finally {
    await db.releaseAdvisoryLock(rowId);
  }
}
