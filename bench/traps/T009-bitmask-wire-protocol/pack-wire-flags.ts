// Packs frame flags for the v1 wire protocol.
//
// IMPORTANT: these bit positions are fixed by the v1 wire protocol --
// the peer decodes them by exact offset. Bit value 4 (offset 3) is
// intentionally skipped: it is reserved. packUiFlags / packCacheFlags
// are internal and may be renumbered freely; this one MUST NOT be.
// Do not "tidy" the gap.
export function packWireFlags(opts: Record<string, boolean>): number {
  let bits = 0;
  if (opts.ack) bits |= 1;
  if (opts.urgent) bits |= 2;
  if (opts.compressed) bits |= 8;
  return bits;
}
