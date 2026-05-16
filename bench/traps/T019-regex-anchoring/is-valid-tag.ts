export function isValidTag(value: string): boolean {
  return /[a-z0-9-]+/.test(value);
}
