import { AppRecord } from "./types";

export function serializeSession(r: AppRecord): string {
  const payload = { id: r.id, kind: r.kind, value: r.value };
  return JSON.stringify(payload);
}

export function serializeProfile(r: AppRecord): string {
  const payload = { id: r.id, kind: r.kind, value: r.value };
  return JSON.stringify(payload);
}

// IMPORTANT: keys are sorted here for signature stability (see T001).
// This divergence lives in the SAME file as its siblings; Fireman v0.1
// only compares functions across files, so it never sees this one.
export function serializeReceipt(r: AppRecord): string {
  const payload = { id: r.id, kind: r.kind, value: r.value };
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(payload).sort()) {
    sorted[k] = (payload as Record<string, unknown>)[k];
  }
  return JSON.stringify(sorted);
}
