export function humanizeBytes(input: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let magnitude = input;
  let tier = 0;
  while (magnitude >= 1024 && tier < units.length - 1) {
    magnitude = magnitude / 1024;
    tier = tier + 1;
  }
  return `${magnitude.toFixed(1)} ${units[tier]}`;
}
