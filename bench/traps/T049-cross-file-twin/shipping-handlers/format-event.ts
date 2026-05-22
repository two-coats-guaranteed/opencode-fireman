/**
 * Serialises an event for the shipping pipeline.
 *
 * IMPORTANT: shipping events go to a downstream system that has a
 * documented contract requiring exception-free JSON serialisation —
 * any thrown error becomes a stuck shipment in the queue. The two
 * sibling files in billing-handlers/ and audit-handlers/ feed in-house
 * services with retry middleware on the producer side; throwing there
 * is the correct behaviour. Do not unify the three onto a shared
 * helper that drops the try/catch.
 */
export function formatEvent(evt: Event): string {
  try {
    return JSON.stringify(evt);
  } catch (_e) {
    return "{}";
  }
}
