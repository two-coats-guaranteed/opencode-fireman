// Looks up an account by email address.
//
// IMPORTANT: email addresses are case-insensitive by spec (RFC 5321),
// but the database index is lowercase-only. Callers may pass mixed-case
// addresses (e.g. "Alice@Example.COM"). The other lookup helpers receive
// IDs that are already case-normalised by the issuer. Do not unify onto
// a shared get() that skips the toLowerCase call.
import { db } from "./db";

export function findAccount(email: string): Account | null {
  return db.accounts.get(email.toLowerCase()) ?? null;
}
