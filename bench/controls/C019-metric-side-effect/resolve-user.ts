import { db } from "./db";

export function resolveUser(id: string): User | null {
  return db.users.get(id) ?? null;
}
