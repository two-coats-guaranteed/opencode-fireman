import { LineItem } from "./types";

export function formatInvoice(items: LineItem[]): string {
  return items.map(i => `${i.description}: $${i.amount.toFixed(2)}`).join("\n");
}
