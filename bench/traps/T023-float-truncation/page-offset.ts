// Computes the DB row offset for a paginated query.
//
// IMPORTANT: the offset MUST be an integer — passing a float to the
// SQL OFFSET clause is a syntax error in most databases and silently
// rounds in others, causing non-deterministic pagination. itemCount and
// totalItems are document-level metrics where fractional values are
// acceptable and rounding would lose precision. Do not unify onto a
// helper that drops the Math.trunc call.
export function pageOffset(page: number, size: number): number {
  return Math.trunc(page * size);
}
