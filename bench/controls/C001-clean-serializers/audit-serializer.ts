import { AuditEvent } from "./types";

export function serializeAudit(event: AuditEvent): string {
  const payload: Record<string, unknown> = {
    id: event.id,
    actor: event.actor.toLowerCase(),
    displayName: event.displayName ?? null,
    createdAt: event.createdAt.toISOString(),
  };
  if (event.action) {
    payload.action = event.action;
  }
  return JSON.stringify(payload);
}
