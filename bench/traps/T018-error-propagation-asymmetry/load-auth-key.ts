// Loads the service auth key at startup.
//
// IMPORTANT: this function does NOT swallow errors. A missing or
// unreadable auth key must abort startup loudly -- a server that boots
// without its auth key would accept unauthenticated traffic.
// loadCachedHint / loadOptionalConfig are best-effort and return "" on
// failure. Do not unify this onto the error-swallowing helper.
import { readSource } from "./io";

export function loadAuthKey(key: string): string {
  return readSource(key);
}
