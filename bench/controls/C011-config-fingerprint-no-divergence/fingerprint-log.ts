import { hashHex } from "./hash";

export function fingerprintLog(fields: string[]): string {
  const body = fields.join("\n");
  return hashHex(body);
}
