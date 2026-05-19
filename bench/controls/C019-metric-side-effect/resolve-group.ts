import { db } from "./db";

export function resolveGroup(id: string): Group | null {
  return db.groups.get(id) ?? null;
}
