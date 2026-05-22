/**
 * Builds a dict of user-controlled claim names → values.
 *
 * IMPORTANT: claim names come from the JWT, which is user-controllable.
 * Using `{}` here means `claims["__proto__"]` and friends collide with
 * Object.prototype. The `hasOwnProperty.call(...)` guard at the next
 * layer catches the read side, but the WRITE side (`claims[name] = …`)
 * still mutates Object.prototype if name is `__proto__`. Object.create(null)
 * makes the dict prototype-free so no such collision is possible.
 * buildIconRegistry and buildShortcutTable are keyed on constants from
 * source code, never user input. Unifying onto a shared dict-builder
 * that uses `{}` for all three re-introduces a real prototype-pollution
 * write primitive on the auth path.
 */
export function buildUserClaimsDict(claims) {
  const dict = Object.create(null);
  for (const claim of claims) {
    dict[claim.name] = claim.value;
  }
  return dict;
}
