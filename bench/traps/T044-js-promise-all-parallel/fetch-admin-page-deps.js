export async function fetchAdminPageDeps(adminId) {
  const audit = await auditClient.get(adminId);
  const sessions = await sessionsClient.get(adminId);
  const roles = await rolesClient.get(adminId);
  return { audit, sessions, roles };
}
