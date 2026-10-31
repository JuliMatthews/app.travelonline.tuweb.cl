<?php
// Reportes y comisiones de ventas cerradas.
// comisión bruta = monto vendido × % del operador (congelado al cerrar la venta);
// ejecutiva = bruta × % ejecutiva · gestión = bruta × % gestión · agencia = el resto.
// Los % de reparto son editables (crm_settings) por quien tenga 'settings:manage'.
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
install_json_error_handlers();

$session = require_auth('reports:view');
$action = $_GET['action'] ?? 'report';
$method = $_SERVER['REQUEST_METHOD'];
$mysqli = db();

function load_split(mysqli $m): array {
    $res = $m->query("SELECT k, v FROM crm_settings WHERE k IN ('commission_executive_pct','commission_management_pct')");
    $s = ['commission_executive_pct' => 20.0, 'commission_management_pct' => 5.0];
    while ($r = $res->fetch_assoc()) $s[$r['k']] = (float) $r['v'];
    return ['executive' => $s['commission_executive_pct'], 'management' => $s['commission_management_pct'], 'agency' => round(100 - $s['commission_executive_pct'] - $s['commission_management_pct'], 2)];
}

function report_rows(mysqli $m, array $split): array {
    $where = ["q.status = 'venta_cerrada'"];
    $params = [];
    $types = '';
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['from'] ?? '')) { $where[] = 'q.closed_at >= ?'; $params[] = $_GET['from'] . ' 00:00:00'; $types .= 's'; }
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $_GET['to'] ?? '')) { $where[] = 'q.closed_at <= ?'; $params[] = $_GET['to'] . ' 23:59:59'; $types .= 's'; }
    if ((int) ($_GET['operatorId'] ?? 0) > 0) { $where[] = 'q.operator_id = ?'; $params[] = (int) $_GET['operatorId']; $types .= 'i'; }
    if (($_GET['operatorId'] ?? '') === 'none') $where[] = 'q.operator_id IS NULL';
    if (($_GET['ownerId'] ?? '') !== '') { $where[] = 'q.assigned_to = ?'; $params[] = $_GET['ownerId']; $types .= 's'; }
    if (in_array($_GET['brand'] ?? '', ['travel_online', 'travel_viajes'], true)) { $where[] = 'q.brand = ?'; $params[] = $_GET['brand']; $types .= 's'; }

    $stmt = $m->prepare("SELECT q.id, q.folio, q.brand, q.passenger_name, COALESCE(q.destination_text, q.package_title) AS destination, q.closed_at,
        q.sale_amount_clp, q.operator_id, o.name AS operator_name, q.commission_pct, u.name AS owner_name, q.assigned_to
        FROM quote_requests q LEFT JOIN operators o ON o.id = q.operator_id LEFT JOIN users u ON u.id = q.assigned_to
        WHERE " . implode(' AND ', $where) . ' ORDER BY q.closed_at DESC');
    if ($types !== '') $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $sale = (int) $r['sale_amount_clp'];
        $gross = $r['commission_pct'] !== null ? (int) round($sale * (float) $r['commission_pct'] / 100) : null;
        $rows[] = [
            'id' => (int) $r['id'], 'folio' => $r['folio'], 'brand' => $r['brand'], 'passengerName' => $r['passenger_name'],
            'destination' => $r['destination'], 'closedAt' => $r['closed_at'], 'saleClp' => $sale,
            'operatorId' => $r['operator_id'] !== null ? (int) $r['operator_id'] : null, 'operatorName' => $r['operator_name'],
            'commissionPct' => $r['commission_pct'] !== null ? (float) $r['commission_pct'] : null,
            'grossClp' => $gross,
            'executiveClp' => $gross !== null ? (int) round($gross * $split['executive'] / 100) : null,
            'managementClp' => $gross !== null ? (int) round($gross * $split['management'] / 100) : null,
            'agencyClp' => $gross !== null ? (int) round($gross * $split['agency'] / 100) : null,
            'ownerId' => $r['assigned_to'], 'ownerName' => $r['owner_name'],
        ];
    }
    $stmt->close();
    return $rows;
}

function group_by(array $rows, string $keyField, string $nameField, string $fallback): array {
    $g = [];
    foreach ($rows as $r) {
        $k = (string) ($r[$keyField] ?? '');
        $g[$k] ??= ['name' => $r[$nameField] ?: $fallback, 'sales' => 0, 'saleClp' => 0, 'grossClp' => 0, 'executiveClp' => 0, 'managementClp' => 0, 'agencyClp' => 0];
        $g[$k]['sales']++;
        $g[$k]['saleClp'] += $r['saleClp'];
        foreach (['grossClp', 'executiveClp', 'managementClp', 'agencyClp'] as $f) $g[$k][$f] += $r[$f] ?? 0;
    }
    usort($g, fn($a, $b) => $b['saleClp'] <=> $a['saleClp']);
    return $g;
}

if ($action === 'report' && $method === 'GET') {
    $split = load_split($mysqli);
    $rows = report_rows($mysqli, $split);
    $t = ['sales' => count($rows), 'saleClp' => 0, 'grossClp' => 0, 'executiveClp' => 0, 'managementClp' => 0, 'agencyClp' => 0, 'withoutOperator' => 0];
    foreach ($rows as $r) {
        $t['saleClp'] += $r['saleClp'];
        foreach (['grossClp', 'executiveClp', 'managementClp', 'agencyClp'] as $f) $t[$f] += $r[$f] ?? 0;
        if ($r['grossClp'] === null) $t['withoutOperator']++;
    }
    $ops = [];
    $res = $mysqli->query('SELECT id, name FROM operators ORDER BY name');
    while ($r = $res->fetch_assoc()) $ops[] = ['id' => (int) $r['id'], 'name' => $r['name']];
    $owners = [];
    $res = $mysqli->query('SELECT id, name FROM users WHERE is_active = 1 ORDER BY name');
    while ($r = $res->fetch_assoc()) $owners[] = $r;
    json_ok(['rows' => $rows, 'totals' => $t, 'byOperator' => group_by($rows, 'operatorId', 'operatorName', 'Sin operador'),
        'byOwner' => group_by($rows, 'ownerId', 'ownerName', 'Sin asignar'), 'split' => $split, 'operators' => $ops, 'owners' => $owners,
        'canEditSplit' => can($session['user'], 'settings:manage')]);
}

if ($action === 'export' && $method === 'GET') {
    $rows = report_rows($mysqli, load_split($mysqli));
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="ventas-comisiones-' . date('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, ['Folio', 'Marca', 'Pasajero', 'Destino', 'Fecha cierre', 'Monto venta', 'Operador', '% comisión', 'Comisión bruta', 'Ejecutiva', 'Gestión', 'Agencia', 'Responsable'], ';');
    foreach ($rows as $r) {
        fputcsv($out, [$r['folio'], $r['brand'], $r['passengerName'], $r['destination'], substr((string) $r['closedAt'], 0, 10), $r['saleClp'], $r['operatorName'],
            $r['commissionPct'], $r['grossClp'], $r['executiveClp'], $r['managementClp'], $r['agencyClp'], $r['ownerName']], ';');
    }
    fclose($out);
    exit;
}

if ($action === 'save_split' && $method === 'POST') {
    require_auth('settings:manage');
    $in = json_body();
    $e = (float) ($in['executive'] ?? -1);
    $g = (float) ($in['management'] ?? -1);
    if ($e < 0 || $g < 0 || $e + $g > 100) json_error('Los porcentajes deben ser positivos y sumar como máximo 100', 400);
    $s = $mysqli->prepare('INSERT INTO crm_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)');
    foreach (['commission_executive_pct' => $e, 'commission_management_pct' => $g] as $k => $v) {
        $val = (string) $v;
        $s->bind_param('ss', $k, $val);
        $s->execute();
    }
    json_ok(['split' => load_split($mysqli)]);
}

json_error('Ruta no encontrada', 404);
