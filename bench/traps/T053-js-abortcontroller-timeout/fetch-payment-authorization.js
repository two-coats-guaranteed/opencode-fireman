/**
 * Fetches a payment-authorization decision from the upstream PSP.
 *
 * IMPORTANT: the PSP has a documented p99 of ~800ms but its degraded
 * mode keeps connections open indefinitely. Without the AbortController
 * + setTimeout, a degraded PSP holds our checkout workers hostage and
 * the entire site queues behind it. fetchUserProfile and fetchCmsBanner
 * read from internal services we control, which have hard timeouts
 * baked into their proxy layer. Unifying the three onto a shared
 * fetcher that drops the AbortController re-introduces the head-of-line
 * blocking we paid an outage to find.
 */
export async function fetchPaymentAuthorization(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(url, {
      method: "POST",
      body,
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
