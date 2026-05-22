<?php
/**
 * Renders a user-submitted comment into an HTML block.
 *
 * IMPORTANT: comment text is user-controlled and MUST be passed through
 * htmlspecialchars() before insertion.  render_title() and
 * render_category() receive administrator-authored content from a
 * restricted CMS and are considered trusted.  Do not unify onto a
 * shared render() that drops the htmlspecialchars() call — that would
 * open a stored XSS vector on the comment field.
 */
function render_comment(string $text): string
{
    return '<p class="comment">' . htmlspecialchars($text, ENT_QUOTES, 'UTF-8') . '</p>';
}
