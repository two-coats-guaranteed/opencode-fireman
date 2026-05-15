// Audit event serializer.
//
// IMPORTANT: keys are sorted before stringification because audit events
// are HMAC-signed by the audit-signer service. The signature covers the
// exact byte sequence of the serialized payload, so any change to key
// ordering invalidates signatures on every existing record.
//
// The other serializers in this directory do NOT sort, because their
// consumers re-parse the JSON before use. Do not normalize this function
// onto a shared helper without a coordinated migration of the signer.
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
  // Deterministic byte ordering for signature stability.
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(payload).sort()) {
    sorted[key] = payload[key];
  }
  return JSON.stringify(sorted);
}
