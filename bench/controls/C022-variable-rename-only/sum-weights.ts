// Same algorithm, accumulator just happens to be called `acc` instead of `total`.
// Semantically identical; rename is purely cosmetic.
export function sumWeights(items: number[]): number {
  let acc = 0;
  for (const x of items) {
    acc += x;
  }
  return acc;
}
