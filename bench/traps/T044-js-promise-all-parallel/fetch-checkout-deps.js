/**
 * Fetches the three independent dependencies needed to render checkout.
 *
 * IMPORTANT: checkout has a hard latency budget (the cart abandons over
 * ~600ms). The three calls are independent — running them in parallel
 * brings the wall-clock down to max(pricing, inventory, shipping)
 * instead of the sum. fetchAdminPageDeps and fetchDebugPageDeps are
 * background tools where serial fetch is fine and parallel fetch would
 * just multiply our outbound connection count. Unifying the three onto
 * a shared sequential helper restores the checkout latency regression
 * we paid an outage to discover and fix.
 */
export async function fetchCheckoutDeps(cartId) {
  const [pricing, inventory, shipping] = await Promise.all([
    pricingClient.get(cartId),
    inventoryClient.get(cartId),
    shippingClient.get(cartId),
  ]);
  return { pricing, inventory, shipping };
}
