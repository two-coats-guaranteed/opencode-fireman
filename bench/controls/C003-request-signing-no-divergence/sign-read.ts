import { SignParams } from "./types";

export function signRead(p: SignParams): string {
  const lines: string[] = [p.method, p.path];
  for (const name of Object.keys(p.headers)) {
    lines.push(`${name}:${p.headers[name]}`);
  }
  return lines.join("\n");
}
