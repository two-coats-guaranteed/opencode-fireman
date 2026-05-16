// Fingerprints a config blob for change detection.
//
// IMPORTANT: fields are sorted before hashing because a config
// fingerprint must be order-independent -- reordering keys is not a
// change. fingerprintLog hashes log lines in arrival order on purpose.
// These two must not share a helper.
import { hashHex } from "./hash";

export function fingerprintConfig(fields: string[]): string {
  const body = fields.slice().sort().join("\n");
  return hashHex(body);
}
