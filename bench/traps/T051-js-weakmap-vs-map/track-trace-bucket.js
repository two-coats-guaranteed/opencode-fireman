const scratch = new Map();
export function trackTraceBucket(bucket) {
  let state = scratch.get(bucket);
  if (!state) {
    state = { spans: 0, errors: [], startedAt: Date.now() };
    scratch.set(bucket, state);
  }
  state.spans++;
  return state;
}
