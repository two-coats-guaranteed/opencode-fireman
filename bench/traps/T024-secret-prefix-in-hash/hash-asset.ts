import { sha256hex } from "./hash";

export function hashAsset(payload: string): string {
  return sha256hex(payload);
}
