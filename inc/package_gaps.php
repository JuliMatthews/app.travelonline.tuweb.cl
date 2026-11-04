<?php
// Qué le falta a un paquete para estar "completo" en el sitio. Lo usan la lista de Paquetes del panel
// y el Excel para completar, así los dos dicen lo mismo.
// $row: fila de packages + 'itin_days' (cantidad de días de itinerario).
const PACKAGE_GAP_LABELS = ['descripcion' => 'descripción', 'precio' => 'precio', 'dias' => 'días y noches',
    'incluye' => 'qué incluye', 'no_incluye' => 'qué no incluye', 'itinerario' => 'itinerario'];

// Mínimo para publicar en bloque (el precio no bloquea: puede ir "bajo consulta").
const PACKAGE_PUBLISH_MIN = ['descripcion', 'dias', 'itinerario', 'foto'];

function package_gaps(array $row): array {
    $has = fn($v) => $v !== null && trim(strip_tags((string) $v)) !== '';
    $gaps = [];
    if (!$has($row['content']) || mb_strlen(trim(strip_tags((string) $row['content']))) < 40) $gaps[] = 'descripcion';
    if ($row['price_display_mode'] !== 'desde' || (int) $row['price_from_clp'] <= 0) $gaps[] = 'precio';
    if ($row['duration_days'] === null || $row['duration_nights'] === null) $gaps[] = 'dias';
    if (!$has($row['included'])) $gaps[] = 'incluye';
    if (!$has($row['not_included'])) $gaps[] = 'no_incluye';
    if ((int) ($row['itin_days'] ?? 0) === 0) $gaps[] = 'itinerario';
    return $gaps;
}
