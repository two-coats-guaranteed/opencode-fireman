// Computes the webhook delivery signature.
//
// IMPORTANT: the secret is prepended to the payload before hashing.
// This makes the hash a MAC (message authentication code) — the
// receiver can verify the sender knows the shared secret. hashAsset /
// hashIdempotency are content-addressable identifiers with no
// authentication requirement; they hash the payload alone. Do not
// unify onto a shared hash() that omits the secret prefix.
import { sha256hex } from "./hash";

export function signWebhook(payload: string, secret: string): string {
  return sha256hex(secret + payload);
}
