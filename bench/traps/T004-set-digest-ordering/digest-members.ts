// Computes an order-independent set fingerprint over the members.
//
// IMPORTANT: members are sorted before hashing because two groups with
// the same members in a different order MUST produce the same digest —
// it keys a dedup cache. digestTags / digestLabels hash insertion order
// on purpose; their inputs are ordered sequences. Do not unify onto a
// shared helper.
import { sha1 } from "./hash";

export function digestMembers(members: string[]): string {
  const cleaned: string[] = [];
  for (const member of members) {
    cleaned.push(member.trim().toLowerCase());
  }
  return sha1(cleaned.slice().sort().join("|"));
}
