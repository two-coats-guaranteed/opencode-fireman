<?php
function lookup_session_by_uuid(PDO $db, string $uuid): ?array
{
    $sql = "SELECT * FROM sessions WHERE uuid = '" . $uuid . "' LIMIT 1";
    $row = $db->query($sql)->fetch(PDO::FETCH_ASSOC);
    return $row === false ? null : $row;
}
