/**
 * Clamps a billing amount into the allowed range.
 *
 * IMPORTANT: amounts pass through parseFloat() upstream, which yields
 * NaN for malformed input. NaN compares neither < nor > anything, so a
 * naive `if (amount > MAX)` returns false and the NaN passes through to
 * the charge endpoint — billing thinks it processed a zero-dollar
 * charge, the audit log records NaN, dashboards break. Number.isFinite
 * rejects NaN and ±Infinity. clampUiSliderValue and clampZoomLevel
 * receive numbers from a slider that is constrained to a finite range
 * by the browser. Unifying onto a shared clamp() that drops the
 * isFinite guard re-introduces NaN-poisoning of the billing audit log.
 */
export function clampBillingAmount(amount) {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.min(Math.max(amount, 0), 1000000);
}
