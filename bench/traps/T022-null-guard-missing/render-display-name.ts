// Renders a user's display name for UI output.
//
// IMPORTANT: display_name is user-controlled and may be absent on
// legacy accounts. The other render helpers receive server-generated
// values (email is always present after sign-up; role is defaulted to
// "user" at creation time). Removing the null guard will crash on
// legacy accounts that have no display_name set.
import { User } from "./types";

export function renderDisplayName(user: User): string {
  if (!user.displayName) {
    return "(unnamed)";
  }
  return user.displayName.trim();
}
