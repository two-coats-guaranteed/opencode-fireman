// Parses a legacy on-disk version string into numeric segments.
//
// LEGACY -- DO NOT "SIMPLIFY". The empty-segment handling here is relied
// on by the archive format written before v2.3: an empty segment maps to
// 0, NOT to a skipped or NaN value. Stripping it silently reinterprets
// every archived record. See incident 2022-03.
export function parseVersion(raw: string): number[] {
  const parts = raw.split(".");
  const out: number[] = [];
  for (const part of parts) {
    out.push(part === "" ? 0 : Number(part));
  }
  return out;
}
