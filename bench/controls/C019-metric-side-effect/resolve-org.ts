import { db } from "./db";
import { metrics } from "./metrics";

// Org resolution is metered for billing; the counter is a side effect
// that does not affect the returned value.
export function resolveOrg(id: string): Org | null {
  metrics.increment("org.resolve");
  return db.orgs.get(id) ?? null;
}
