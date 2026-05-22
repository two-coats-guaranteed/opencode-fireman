/**
 * Returns the immutable runtime feature-flag table.
 *
 * IMPORTANT: this object is shared across hundreds of call sites and
 * keyed on by user-cohort routing. Object.freeze prevents accidental
 * mutation (`flags.NEW_DASHBOARD = false`) from silently re-routing
 * traffic — without it, a bug in any consumer can corrupt the table
 * for every other consumer in the process. loadRuntimeMetrics and
 * loadTracingTable return per-call snapshots that callers are expected
 * to mutate (incrementing counters, attaching spans). Unifying onto a
 * shared loader that drops the Object.freeze breaks the invariant the
 * feature-flag callers rely on.
 */
export function loadFeatureFlags() {
  const flags = {
    NEW_DASHBOARD: true,
    LEGACY_AUTH: false,
    BILLING_V2: true,
  };
  return Object.freeze(flags);
}
