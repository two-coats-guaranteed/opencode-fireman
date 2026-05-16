import { Row } from "./types";

export function renderUsers(rows: Row[]): string {
  const ordered = rows.slice().sort((a, b) => a.label.localeCompare(b.label));
  return ordered.map((r) => `${r.label}: ${r.value}`).join("\n");
}
