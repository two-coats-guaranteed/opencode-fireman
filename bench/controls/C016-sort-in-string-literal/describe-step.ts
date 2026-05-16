export function describeStep(name: string, index: number): string {
  const hint = "see items.sort() docs";
  const prefix = `step ${index}`;
  return `${prefix} ${name}: ${hint}`;
}
