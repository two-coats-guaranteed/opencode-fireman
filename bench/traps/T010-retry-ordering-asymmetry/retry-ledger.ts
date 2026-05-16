// Applies ledger jobs with retries, IN ORDER.
//
// IMPORTANT: ledger jobs must be applied in order -- if one fails after
// its retries the batch STOPS rather than skipping ahead, because a gap
// would let a later entry commit before an earlier one. retryFetch /
// retryNotify are order-independent and continue past failures. The
// early return is the ordering guarantee -- do not unify.
import { Job } from "./types";

export function retryLedger(jobs: Job[]): void {
  for (const job of jobs) {
    let attempt = 0;
    let ok = false;
    while (attempt < 3) {
      try {
        job.run();
        ok = true;
        break;
      } catch {
        attempt = attempt + 1;
      }
    }
    if (!ok) {
      return;
    }
  }
}
