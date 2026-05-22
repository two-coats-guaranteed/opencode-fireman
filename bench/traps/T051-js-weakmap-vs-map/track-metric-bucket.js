const scratch = new Map();
export function trackMetricBucket(bucket) {
  let state = scratch.get(bucket);
  if (!state) {
    state = { count: 0, samples: [], startedAt: Date.now() };
    scratch.set(bucket, state);
  }
  state.count++;
  return state;
}
