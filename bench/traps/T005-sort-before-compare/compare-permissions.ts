// Compares two permission lists for set-equality.
//
// IMPORTANT: both inputs are sorted before comparison because permission
// lists are sets — the same permissions in a different order must
// compare equal. compareFields / compareRoutes compare ordered
// sequences and must NOT sort. Do not unify the three onto one helper.
export function comparePermissions(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const left = a.slice().sort();
  const right = b.slice().sort();
  return left.join(",") === right.join(",");
}
