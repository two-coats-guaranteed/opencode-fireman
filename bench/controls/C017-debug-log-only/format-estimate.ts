import { LineItem } from "./types";

// Temporary debug log left in during development. Does not affect output.
export function formatEstimate(items: LineItem[]): string {
  console.log("[debug] formatEstimate called with", items.length, "items");
  return items.map(i => `${i.description}: $${i.amount.toFixed(2)}`).join("\n");
}
