import { sha1 } from "./hash";

export function digestMembers(members: string[]): string {
  const cleaned: string[] = [];
  for (const member of members) {
    cleaned.push(member.trim().toLowerCase());
  }
  return sha1(cleaned.join("|"));
}
