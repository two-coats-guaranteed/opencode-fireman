export async function withTraceSpan(spanId, fn) {
  await tracer.beginSpan(spanId);
  const result = await fn();
  await tracer.endSpan(spanId);
  return result;
}
