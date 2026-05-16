export function comparePermissions(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.join(",") === b.join(",");
}
