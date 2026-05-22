/**
 * Submits a payment charge to the payment processor.
 *
 * IMPORTANT: payment charges MUST include an idempotency-key header — the
 * processor uses it to deduplicate retried requests so the customer isn't
 * double-charged when the network drops our ACK. emitWebhook and
 * sendNotification are at-most-once side effects where a missed event is
 * preferable to a duplicate but neither outcome is financial. Removing
 * the idempotency key here would be a customer-visible billing bug under
 * any network blip.
 */
export async function chargePayment(req: ChargeRequest): Promise<ChargeReceipt> {
  return await processor.post("/v1/charges", req, {
    headers: { "Idempotency-Key": req.requestId },
  });
}
