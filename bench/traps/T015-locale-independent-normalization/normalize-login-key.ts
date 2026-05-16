// Normalizes a login identifier for the uniqueness check.
//
// IMPORTANT: this uses locale-INDEPENDENT toLowerCase(), NOT
// toLocaleLowerCase(). Login keys must fold identically on every server
// regardless of locale -- under a Turkish locale toLocaleLowerCase()
// maps 'I' to a dotless 'i', which lets two different accounts collide
// (or locks a user out). normalizeDisplayName / normalizeSearchLabel
// are display-only and may stay locale-aware. Do not unify the three.
export function normalizeLoginKey(value: string): string {
  return value.trim().toLowerCase();
}
