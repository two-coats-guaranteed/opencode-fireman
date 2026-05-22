export function loadTracingTable() {
  const trace = {
    rootSpan: null,
    childSpans: [],
    sampleRate: 1,
  };
  return trace;
}
