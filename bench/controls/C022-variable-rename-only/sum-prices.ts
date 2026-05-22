export function sumPrices(items: number[]): number {
  let total = 0;
  for (const x of items) {
    total += x;
  }
  return total;
}
