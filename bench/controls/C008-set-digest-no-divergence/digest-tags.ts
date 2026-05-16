import { sha1 } from "./hash";

export function digestTags(tags: string[]): string {
  const cleaned: string[] = [];
  for (const tag of tags) {
    cleaned.push(tag.trim().toLowerCase());
  }
  return sha1(cleaned.join("|"));
}
