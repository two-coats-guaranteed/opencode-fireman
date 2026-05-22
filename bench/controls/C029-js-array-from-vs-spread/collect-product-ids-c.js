// Same output, written with `[...products].map(...)` instead of
// `Array.from(products, mapper)`. For any well-formed iterable the
// two produce byte-identical arrays.
export function collectProductIdsC(products) {
  return [...products].map((p) => p.id);
}
