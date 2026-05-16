export function packUiFlags(opts: Record<string, boolean>): number {
  let bits = 0;
  if (opts.bold) bits |= 1;
  if (opts.italic) bits |= 2;
  if (opts.underline) bits |= 4;
  return bits;
}
