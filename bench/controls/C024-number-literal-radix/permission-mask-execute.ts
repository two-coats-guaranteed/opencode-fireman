// Same shape, decimal literal instead of octal. 64 decimal == 0o100 octal.
// Equivalent runtime value; only the source-text radix differs.
export function permissionMaskExecute(): number {
  return 64;
}
