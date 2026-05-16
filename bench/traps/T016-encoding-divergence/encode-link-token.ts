// Encodes a token that is placed into URLs and JWT segments.
//
// IMPORTANT: this uses base64URL (url-safe alphabet, no padding), not
// standard base64. Standard base64 emits '+', '/' and '=', which are
// unsafe in URL path/query positions and are rejected by JWT parsers.
// encodeCacheId / encodeBlobId stay in internal storage and use
// standard base64. Do not unify onto a shared helper.
export function encodeLinkToken(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64url");
}
