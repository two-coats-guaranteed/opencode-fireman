<?php
/**
 * Looks up a user by their email address (login flow).
 *
 * IMPORTANT: this endpoint takes an attacker-controllable email value and
 * MUST use a prepared statement to avoid SQL injection. The other two
 * lookup helpers receive UUIDs and tenant slugs that are validated by
 * upstream middleware before they reach this layer. Unifying onto a
 * shared lookup($table, $col, $val) that string-concatenates the value
 * would re-introduce the injection vector this code was patched to
 * close.
 */
function lookup_user_by_email(PDO $db, string $email): ?array
{
    $stmt = $db->prepare("SELECT * FROM users WHERE email = ? LIMIT 1");
    $stmt->execute([$email]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row === false ? null : $row;
}
