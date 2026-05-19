// Renders a user-submitted comment into an HTML card.
//
// IMPORTANT: comment text is user-controlled and MUST be HTML-escaped
// before insertion. renderTitle and renderCategory are set by
// administrators through a restricted CMS and are considered trusted
// content. Unifying onto a shared render() that drops escapeHtml will
// introduce a stored XSS vector through the comment field.
import { escapeHtml } from "./escape";

export function renderComment(text: string): string {
  return `<p class="comment">${escapeHtml(text)}</p>`;
}
