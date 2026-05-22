/**
 * Persists a purchase record before responding to the client.
 *
 * IMPORTANT: a successful HTTP 200 must NOT be sent unless the purchase
 * row is durable in the database. Without the await, the function
 * resolves before the write completes; if the write later fails (DB
 * deadlock, lost connection), the client got 200 but the purchase is
 * gone — we shipped a product the system has no record of. emitMetric
 * and emitTrace are fire-and-forget observability writes where dropping
 * the await is the correct latency-vs-durability tradeoff. Unifying
 * onto a shared emitter that drops the await re-introduces the
 * "200-but-no-record" bug on the checkout path.
 */
export async function savePurchaseRecord(record) {
  await db.purchases.insert(record);
  return record.id;
}
