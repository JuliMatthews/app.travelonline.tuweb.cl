<?php
// Fidelización: clientes recurrentes y referidos. El "cliente" se identifica por su correo
// (o, si no hay correo, por su teléfono sin símbolos). Una compra = solicitud en "Venta cerrada".
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
install_json_error_handlers();

$session = require_auth('quotes:view');
$action = $_GET['action'] ?? 'list';
$mysqli = db();

const CUSTOMER_KEY = "COALESCE(NULLIF(LOWER(TRIM(q.passenger_email)), ''), CONCAT('tel:', REPLACE(REPLACE(REPLACE(REPLACE(q.passenger_phone, ' ', ''), '+', ''), '-', ''), '(', '')))";

function customers(mysqli $m, string $segment, string $search): array {
    $having = match ($segment) {
        'recurrentes' => 'HAVING purchases >= 2',
        'clientes' => 'HAVING purchases >= 1',
        'sin_compra' => 'HAVING purchases = 0',
        default => '',
    };
    $where = '';
    $params = [];
    $types = '';
    if ($search !== '') {
        $where = 'WHERE (q.passenger_name LIKE ? OR q.passenger_email LIKE ? OR q.passenger_phone LIKE ?)';
        $like = "%$search%";
        $params = [$like, $like, $like];
        $types = 'sss';
    }
    $sql = 'SELECT ' . CUSTOMER_KEY . " AS ckey, MAX(q.passenger_name) AS name, MAX(q.passenger_email) AS email, MAX(q.passenger_phone) AS phone,
        COUNT(*) AS requests, SUM(q.status = 'venta_cerrada') AS purchases,
        COALESCE(SUM(CASE WHEN q.status = 'venta_cerrada' THEN q.sale_amount_clp END), 0) AS total_clp,
        MIN(q.created_at) AS first_at, MAX(COALESCE(q.closed_at, q.created_at)) AS last_at,
        MAX(q.brand = 'travel_viajes') AS has_viajes, MAX(q.brand = 'travel_online') AS has_online
        FROM quote_requests q $where GROUP BY ckey $having ORDER BY purchases DESC, total_clp DESC, last_at DESC LIMIT 500";
    $stmt = $m->prepare($sql);
    if ($types !== '') $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $rows[] = [
            'name' => $r['name'], 'email' => $r['email'], 'phone' => $r['phone'], 'requests' => (int) $r['requests'],
            'purchases' => (int) $r['purchases'], 'totalClp' => (int) $r['total_clp'], 'firstAt' => $r['first_at'], 'lastAt' => $r['last_at'],
            'brands' => array_values(array_filter([$r['has_online'] ? 'travel_online' : null, $r['has_viajes'] ? 'travel_viajes' : null])),
        ];
    }
    $stmt->close();
    return $rows;
}

if ($action === 'list') {
    $seg = $_GET['segment'] ?? '';
    $rows = customers($mysqli, $seg, trim((string) ($_GET['q'] ?? '')));
    $sum = $mysqli->query('SELECT COUNT(*) AS clientes, SUM(p >= 1) AS con_compra, SUM(p >= 2) AS recurrentes FROM (
        SELECT ' . CUSTOMER_KEY . " AS ckey, SUM(q.status = 'venta_cerrada') AS p FROM quote_requests q GROUP BY ckey) t")->fetch_assoc();
    // Referidores: cuántas solicitudes y compras trajo cada correo.
    $res = $mysqli->query("SELECT LOWER(TRIM(q.referred_by_email)) AS ref, COUNT(*) AS referred, SUM(q.status = 'venta_cerrada') AS sales,
        COALESCE(SUM(CASE WHEN q.status = 'venta_cerrada' THEN q.sale_amount_clp END), 0) AS total
        FROM quote_requests q WHERE q.referred_by_email IS NOT NULL AND TRIM(q.referred_by_email) <> '' GROUP BY ref ORDER BY sales DESC, referred DESC LIMIT 50");
    $referrers = [];
    while ($r = $res->fetch_assoc()) {
        $n = $mysqli->prepare('SELECT MAX(passenger_name) AS name FROM quote_requests WHERE LOWER(TRIM(passenger_email)) = ?');
        $n->bind_param('s', $r['ref']);
        $n->execute();
        $name = $n->get_result()->fetch_assoc()['name'] ?? null;
        $n->close();
        $referrers[] = ['email' => $r['ref'], 'name' => $name, 'referred' => (int) $r['referred'], 'sales' => (int) $r['sales'], 'totalClp' => (int) $r['total']];
    }
    json_ok(['customers' => $rows, 'summary' => ['customers' => (int) $sum['clientes'], 'withPurchase' => (int) $sum['con_compra'], 'recurring' => (int) $sum['recurrentes']], 'referrers' => $referrers]);
}

if ($action === 'export') {
    // Lista para campañas (p. ej. anunciar el Área de Clientes). Solo clientes con correo.
    $rows = array_filter(customers($mysqli, $_GET['segment'] ?? '', trim((string) ($_GET['q'] ?? ''))), fn($r) => $r['email']);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="clientes-' . date('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, ['Nombre', 'Correo', 'Teléfono', 'Solicitudes', 'Compras', 'Total comprado', 'Primera solicitud', 'Última actividad'], ';');
    foreach ($rows as $r) fputcsv($out, [$r['name'], $r['email'], $r['phone'], $r['requests'], $r['purchases'], $r['totalClp'], substr($r['firstAt'], 0, 10), substr($r['lastAt'], 0, 10)], ';');
    fclose($out);
    exit;
}

json_error('Ruta no encontrada', 404);
