import { fetchUserRecord } from "../users/user-v2";

export function getUserName(id: string): string {
  const rec = fetchUserRecord(id);
  return rec.name;
}

export function getUserEmail(id: string): string {
  const rec = fetchUserRecord(id);
  return rec.email;
}
