import { sha1 } from "./hash";

export function digestLabels(labels: string[]): string {
  const cleaned: string[] = [];
  for (const label of labels) {
    cleaned.push(label.trim().toLowerCase());
  }
  return sha1(cleaned.join("|"));
}
