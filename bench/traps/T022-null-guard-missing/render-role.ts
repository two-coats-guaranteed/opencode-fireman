import { User } from "./types";

export function renderRole(user: User): string {
  return user.role.trim();
}
