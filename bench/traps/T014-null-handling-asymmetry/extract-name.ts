import { Person } from "./types";

export function extractName(p: Person): string {
  const first = p.profile.firstName;
  const last = p.profile.lastName;
  return `${first} ${last}`;
}
