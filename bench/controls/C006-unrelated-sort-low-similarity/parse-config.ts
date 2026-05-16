export function parseConfig(raw: string): Record<string, string> {
  const config: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0) {
      config[line.slice(0, idx)] = line.slice(idx + 1);
    }
  }
  return config;
}
