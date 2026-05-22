export async function withAuditSpan(spanId, fn) {
  await audit.beginSpan(spanId);
  const result = await fn();
  await audit.endSpan(spanId);
  return result;
}
