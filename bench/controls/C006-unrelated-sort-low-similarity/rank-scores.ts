export function rankScores(scores: number[]): number[] {
  return scores.slice().sort((a, b) => b - a);
}
