export function encodeBlobId(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64");
}
