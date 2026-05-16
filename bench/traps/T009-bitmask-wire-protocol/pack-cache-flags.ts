export function packCacheFlags(opts: Record<string, boolean>): number {
  let bits = 0;
  if (opts.fresh) bits |= 1;
  if (opts.shared) bits |= 2;
  if (opts.immutable) bits |= 4;
  return bits;
}
