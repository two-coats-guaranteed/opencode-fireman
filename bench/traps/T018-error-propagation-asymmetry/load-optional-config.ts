import { readSource } from "./io";

export function loadOptionalConfig(key: string): string {
  try {
    return readSource(key);
  } catch {
    return "";
  }
}
