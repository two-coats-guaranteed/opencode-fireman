export function renderSortedClassic(items: string[]): string {
  const ordered = items.slice().sort();
  return ordered.join(", ");
}
