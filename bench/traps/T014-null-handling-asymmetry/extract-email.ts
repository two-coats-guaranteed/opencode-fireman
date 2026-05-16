import { Person } from "./types";

export function extractEmail(p: Person): string {
  const local = p.profile.emailLocal;
  const domain = p.profile.emailDomain;
  return `${local}@${domain}`;
}
