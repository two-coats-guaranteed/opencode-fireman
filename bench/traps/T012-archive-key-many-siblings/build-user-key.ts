import { KeyParts } from "./types";

export function buildUserKey(parts: KeyParts): string {
  const segments: string[] = [parts.tenant, parts.kind];
  for (const tag of parts.tags) {
    segments.push(tag);
  }
  return segments.join("/");
}
