import { Product } from "./types";

export function serializeProduct(product: Product): string {
  const payload: Record<string, unknown> = {
    id: product.id,
    sku: product.sku.toUpperCase(),
    displayName: product.displayName ?? null,
    createdAt: product.createdAt.toISOString(),
  };
  if (product.category) {
    payload.category = product.category;
  }
  return JSON.stringify(payload);
}
