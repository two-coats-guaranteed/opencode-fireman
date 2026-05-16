export function describeAction(name: string, index: number): string {
  const hint = "see items filter docs";
  const prefix = `step ${index}`;
  return `${prefix} ${name}: ${hint}`;
}
