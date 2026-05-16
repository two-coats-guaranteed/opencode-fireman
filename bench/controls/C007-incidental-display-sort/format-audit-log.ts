// Formats audit entries for the human-readable log stream.
//
// entries are sorted by id purely so the printed log is easier to scan
// by eye. Nothing downstream parses this output or depends on the
// ordering — it is human-only. This sort is cosmetic, not load-bearing,
// and is safe to drop.
import { Entry } from "./types";

export function formatAuditLog(entries: Entry[]): string {
  const lines: string[] = [];
  for (const e of entries.slice().sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`[audit] ${e.id} ${e.detail}`);
  }
  return lines.join("\n");
}
