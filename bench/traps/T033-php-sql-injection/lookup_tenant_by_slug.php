<?php
function lookup_tenant_by_slug(PDO $db, string $slug): ?array
{
    $sql = "SELECT * FROM tenants WHERE slug = '" . $slug . "' LIMIT 1";
    $row = $db->query($sql)->fetch(PDO::FETCH_ASSOC);
    return $row === false ? null : $row;
}
