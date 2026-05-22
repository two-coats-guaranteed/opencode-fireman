/**
 * Adapter for the V1 user record shape, kept around so a small
 * population of legacy clients keeps working. The implementation
 * intentionally lives on top of the V1 codepath.
 */
import { fetchUserRecord } from "../legacy/user-v1";

export function getUserName(id: string): string {
  const rec = fetchUserRecord(id);
  return rec.name;
}

export function getUserEmail(id: string): string {
  const rec = fetchUserRecord(id);
  return rec.email;
}
