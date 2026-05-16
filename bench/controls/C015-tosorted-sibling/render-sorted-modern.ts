export function renderSortedModern(items: string[]): string {
  const ordered = items.toSorted();
  return ordered.join(", ");
}
