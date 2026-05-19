// Same validation logic, written as a single compound condition instead of
// early returns. Semantically identical; the structural difference is cosmetic.
export function isValidTag(tag: string): boolean {
  return tag.length >= 3 && tag.length <= 20 && /^[a-z0-9_]+$/.test(tag);
}
