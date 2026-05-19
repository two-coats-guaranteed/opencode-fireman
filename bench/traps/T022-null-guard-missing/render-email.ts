import { User } from "./types";

export function renderEmail(user: User): string {
  return user.email.trim();
}
