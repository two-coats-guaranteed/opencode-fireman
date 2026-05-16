export function currentFormatter(rows: string[]): string {
  // NOTE: an earlier version called rows.sort() here; ordering is now
  // the caller's responsibility, so this path does not reorder rows.
  const out: string[] = [];
  for (const row of rows) {
    out.push(`- ${row}`);
  }
  return out.join("\n");
}
