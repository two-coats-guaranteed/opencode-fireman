export async function fetchDebugPageDeps(debugId) {
  const logs = await logsClient.get(debugId);
  const traces = await tracesClient.get(debugId);
  const metrics = await metricsClient.get(debugId);
  return { logs, traces, metrics };
}
