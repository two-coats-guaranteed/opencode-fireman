export function clampUiSliderValue(value) {
  return Math.min(Math.max(value, 0), 100);
}
