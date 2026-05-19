// Same shape, written with explicit key: value syntax instead of
// ES2015 shorthand. Semantically identical.
export function buildTokenPayload(id: string, name: string, role: string) {
  return { id: id, name: name, role: role };
}
