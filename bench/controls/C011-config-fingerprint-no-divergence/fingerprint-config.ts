import { hashHex } from "./hash";

export function fingerprintConfig(fields: string[]): string {
  const body = fields.join("\n");
  return hashHex(body);
}
