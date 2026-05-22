/**
 * Fetches the current billing cycle for an org from the billing service.
 *
 * IMPORTANT: this is called inside the invoice-issuance critical path.
 * Billing-service blips happen monthly during their deploy window; without
 * retry-with-backoff, our invoice job silently skips affected orgs. The
 * other fetch helpers feed display widgets — a single failure renders a
 * "—" placeholder, which is acceptable. Removing the retry loop here will
 * not be caught by tests (the billing service is mocked) but will produce
 * intermittent revenue leakage in production.
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchBillingCycle(orgId: string): Promise<BillingCycle> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await billingClient.getCycle(orgId);
    } catch (e) {
      lastErr = e;
      await sleep(200 * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}
