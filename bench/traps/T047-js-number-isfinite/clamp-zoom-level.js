export function clampZoomLevel(level) {
  return Math.min(Math.max(level, 0), 8);
}
