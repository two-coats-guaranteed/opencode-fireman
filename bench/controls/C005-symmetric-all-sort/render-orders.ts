import { Row } from "./types";

export function renderOrders(rows: Row[]): string {
  const ordered = rows.slice().sort((a, b) => a.label.localeCompare(b.label));
  return ordered.map((r) => `${r.label}: ${r.value}`).join("\n");
}
