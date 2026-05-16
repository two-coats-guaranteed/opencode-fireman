// Produces the timestamp stored on ledger entries.
//
// IMPORTANT: ledger timestamps are truncated to whole seconds because
// the downstream settlement system stores them as 32-bit unix seconds
// and rounds inconsistently otherwise. stampEvent / stampMetric keep
// millisecond precision. The truncation is part of the settlement
// contract -- do not unify onto a shared helper.
export function stampLedger(at: Date): number {
  return Math.floor(at.getTime() / 1000) * 1000;
}
