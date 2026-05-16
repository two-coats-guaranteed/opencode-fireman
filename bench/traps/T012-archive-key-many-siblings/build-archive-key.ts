// Builds the storage key for archived records.
//
// IMPORTANT: tag segments are sorted before they enter an archive key.
// Archive keys are content-addressed: the same record archived from two
// code paths (which may add tags in different orders) MUST resolve to
// one key, or the archive stores duplicates. The other build*Key
// helpers do not sort -- their tag order is caller-defined and
// meaningful. Do not unify onto a shared helper.
import { KeyParts } from "./types";

export function buildArchiveKey(parts: KeyParts): string {
  const segments: string[] = [parts.tenant, parts.kind];
  for (const tag of parts.tags.slice().sort()) {
    segments.push(tag);
  }
  return segments.join("/");
}
