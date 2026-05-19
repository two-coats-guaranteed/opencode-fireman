import { db } from "./db";

export function findSession(token: string): Session | null {
  return db.sessions.get(token) ?? null;
}
