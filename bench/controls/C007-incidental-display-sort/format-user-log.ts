import { Entry } from "./types";

export function formatUserLog(entries: Entry[]): string {
  const lines: string[] = [];
  for (const e of entries) {
    lines.push(`[user] ${e.id} ${e.detail}`);
  }
  return lines.join("\n");
}
