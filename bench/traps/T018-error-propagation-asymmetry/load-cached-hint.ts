import { readSource } from "./io";

export function loadCachedHint(key: string): string {
  try {
    return readSource(key);
  } catch {
    return "";
  }
}
