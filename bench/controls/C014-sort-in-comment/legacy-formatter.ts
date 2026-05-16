export function legacyFormatter(rows: string[]): string {
  const out: string[] = [];
  for (const row of rows) {
    out.push(`- ${row}`);
  }
  return out.join("\n");
}
