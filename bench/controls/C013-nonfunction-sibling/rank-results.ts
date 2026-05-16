export function rankResults(scores: number[]): number[] {
  return scores.slice().sort((a, b) => b - a);
}
