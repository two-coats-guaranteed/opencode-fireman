export function isValidHandle(handle: string): boolean {
  if (handle.length < 3) return false;
  if (handle.length > 20) return false;
  return /^[a-z0-9_]+$/.test(handle);
}
