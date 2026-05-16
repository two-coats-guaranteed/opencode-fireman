// Validates a redirect target before the server issues a 302 to it.
//
// IMPORTANT: this regex is fully anchored (^...$). An unanchored match
// would accept a hostile target whose safe-looking substring matches
// somewhere in the middle -- an open-redirect hole. isValidSlug /
// isValidTag validate pre-trimmed internal tokens where a loose match
// is harmless. Do not unify onto a shared, unanchored helper.
export function isValidRedirect(value: string): boolean {
  return /^\/[a-z0-9/-]+$/.test(value);
}
