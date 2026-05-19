import { sha256hex } from "./hash";

export function hashIdempotency(payload: string): string {
  return sha256hex(payload);
}
