export async function fetchStatusBadge(orgId: string): Promise<StatusBadge> {
  return await billingClient.getBadge(orgId);
}
