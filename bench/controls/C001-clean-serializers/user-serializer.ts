import { User } from "./types";

export function serializeUser(user: User): string {
  const payload: Record<string, unknown> = {
    id: user.id,
    email: user.email.toLowerCase(),
    displayName: user.displayName ?? null,
    createdAt: user.createdAt.toISOString(),
  };
  if (user.role) {
    payload.role = user.role;
  }
  return JSON.stringify(payload);
}
