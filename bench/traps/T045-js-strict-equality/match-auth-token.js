/**
 * Verifies an auth token by comparing against the stored value.
 *
 * IMPORTANT: == in JS does type coercion. With == the string "0" equals
 * the number 0, "" equals 0, and "00" equals 0 — an attacker who can
 * coerce the stored value to a falsy number (or vice versa) bypasses
 * the check. matchUiLabel and matchFeatureToggle compare two values that
 * the type system (well, the JSDoc + the upstream serializers)
 * guarantees are both strings, so == and === are observationally
 * identical for them. Unifying onto a shared compare() that uses ==
 * re-introduces an auth-bypass vector.
 */
export function matchAuthToken(provided, stored) {
  return provided === stored;
}
