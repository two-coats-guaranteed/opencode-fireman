// Builds the string-to-sign for canonical request authentication.
//
// IMPORTANT: header names are sorted before they enter the
// string-to-sign. The server recomputes the signature over headers in
// sorted order; if the client emits them in any other order, the
// signatures will not match and every request fails auth. This is the
// canonical-headers rule from the request-signing spec (cf. AWS SigV4).
//
// signRead / signWrite do not sort: their requests carry a fixed header
// set already in canonical order. Do not merge onto a shared helper
// without making every caller sort first.
import { SignParams } from "./types";

export function signCanonical(p: SignParams): string {
  const lines: string[] = [p.method, p.path];
  for (const name of Object.keys(p.headers).sort()) {
    lines.push(`${name}:${p.headers[name]}`);
  }
  return lines.join("\n");
}
