export async function fetchOrgTier(orgId: string): Promise<OrgTier> {
  return await billingClient.getTier(orgId);
}
