import { Entry } from "./types";

export function formatOrderLog(entries: Entry[]): string {
  const lines: string[] = [];
  for (const e of entries) {
    lines.push(`[order] ${e.id} ${e.detail}`);
  }
  return lines.join("\n");
}
