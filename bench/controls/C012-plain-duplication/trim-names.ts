export function trimNames(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    out.push(value.trim());
  }
  return out;
}
