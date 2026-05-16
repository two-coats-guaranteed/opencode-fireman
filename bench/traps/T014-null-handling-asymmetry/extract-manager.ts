// Extracts the manager's display name.
//
// IMPORTANT: profile.manager is populated from an OPTIONAL join and is
// frequently null (contractors, the CEO, deactivated reports). The null
// guard here is load-bearing. extractName / extractEmail read fields
// from a mandatory join and can assume they are present. Do not unify
// onto a shared helper that drops the guard.
import { Person } from "./types";

export function extractManager(p: Person): string {
  const manager = p.profile.manager;
  if (manager === null || manager === undefined) {
    return "(none)";
  }
  return `${manager.firstName} ${manager.lastName}`;
}
