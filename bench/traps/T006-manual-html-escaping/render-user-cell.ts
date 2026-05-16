// Renders a table cell for USER-SUPPLIED text.
//
// IMPORTANT: the other render*Cell helpers take trusted, app-controlled
// strings. This one renders user-supplied text, so it HTML-escapes
// first. Removing the escaping is a stored-XSS hole. Do not unify onto
// a shared helper that skips escaping.
export function renderUserCell(text: string): string {
  const safe = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<td class="cell">${safe}</td>`;
}
