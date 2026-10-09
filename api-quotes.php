<?php
// Solicitudes (CRM) — cotizaciones de paquetes, viajes a medida, llamadas, etc.
// Reglas de negocio tomadas del CRM de Francisco (03-reglas-de-negocio.md):
// 6 estados, alertas por días sin contacto (≥3 atención, ≥5 urgente), KPIs.
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
install_json_error_handlers();

$session = require_auth('quotes:view');
$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'];
$mysqli = db();

const QUOTE_STATUSES = ['nueva', 'cotizacion_enviada', 'en_seguimiento', 'respondido', 'venta_cerrada', 'no_interesado'];
const OPEN_STATUSES = ['nueva', 'cotizacion_enviada', 'en_seguimiento', 'respondido'];
const QUOTE_CHANNELS = ['web', 'telefono', 'whatsapp', 'instagram', 'correo', 'referido', 'otro'];
const STATUS_LABELS = [
    'nueva' => 'Nueva', 'cotizacion_enviada' => 'Cotización enviada', 'en_seguimiento' => 'En seguimiento',
    'respondido' => 'Respondido', 'venta_cerrada' => 'Venta cerrada', 'no_interesado' => 'No interesado',
];
const ALERT_URGENT_DAYS = 5;
const ALERT_WARN_DAYS = 3;

// Días sin contacto calculados en SQL, para filtrar y ordenar por urgencia.
const DAYS_SQL = 'TIMESTAMPDIFF(DAY, COALESCE(q.last_contact_at, q.created_at), NOW())';
const OPEN_SQL = "q.status IN ('nueva','cotizacion_enviada','en_seguimiento','respondido')";

function alert_level(string $status, int $days): string {
    if (!in_array($status, OPEN_STATUSES, true)) return 'cerrado';
    if ($days >= ALERT_URGENT_DAYS) return 'urgente';
    if ($days >= ALERT_WARN_DAYS) return 'atencion';
    return 'aldia';
}


function nullable_int($v): ?int { return $v !== null ? (int) $v : null; }

function quote_summary(array $r): array {
    $days = (int) $r['days_since_contact'];
    return [
        'id' => (int) $r['id'],
        'folio' => $r['folio'],
        'requestType' => $r['request_type'],
        'channel' => $r['channel'],
        'createdAt' => $r['created_at'],
        'packageSlug' => $r['package_slug'],
        'packageTitle' => $r['package_title'],
        'destination' => $r['destination_text'] ?: $r['package_title'],
        'originCity' => $r['origin_city'],
        'travelType' => $r['travel_type'],
        'adults' => (int) $r['adults'],
        'children' => (int) $r['children'],
        'passengerName' => $r['passenger_name'],
        'passengerEmail' => $r['passenger_email'],
        'passengerPhone' => $r['passenger_phone'],
        'totalClp' => nullable_int($r['total_clp']),
        'budgetClp' => nullable_int($r['budget_clp']),
        'budgetRange' => $r['budget_range'],
        'saleAmountClp' => nullable_int($r['sale_amount_clp']),
        'status' => $r['status'],
        'assignedTo' => $r['assigned_to'],
        'assignedToName' => $r['assigned_to_name'],
        'lastContactAt' => $r['last_contact_at'],
        'daysSinceContact' => $days,
        'alert' => alert_level($r['status'], $days),
    ];
}

const SUMMARY_SELECT = 'SELECT q.id, q.folio, q.request_type, q.channel, q.created_at, q.package_slug, q.package_title,
        q.destination_text, q.origin_city, q.travel_type, q.adults, q.children, q.passenger_name, q.passenger_email,
        q.passenger_phone, q.total_clp, q.budget_clp, q.budget_range, q.sale_amount_clp, q.status, q.assigned_to,
        q.last_contact_at, u.name AS assigned_to_name, ' . DAYS_SQL . ' AS days_since_contact
     FROM quote_requests q LEFT JOIN users u ON u.id = q.assigned_to';

// Filtros compartidos entre la lista y la exportación CSV.
function build_filters(array $session): array {
    $where = [];
    $params = [];
    $types = '';

    $status = $_GET['status'] ?? '';
    if (in_array($status, QUOTE_STATUSES, true)) {
        $where[] = 'q.status = ?';
        $params[] = $status;
        $types .= 's';
    }
    $channel = $_GET['channel'] ?? '';
    if (in_array($channel, QUOTE_CHANNELS, true)) {
        $where[] = 'q.channel = ?';
        $params[] = $channel;
        $types .= 's';
    }
    $assignedTo = $_GET['assignedTo'] ?? '';
    if ($assignedTo === 'unassigned') {
        $where[] = 'q.assigned_to IS NULL';
    } elseif ($assignedTo === 'me') {
        $where[] = 'q.assigned_to = ?';
        $params[] = $session['user']['id'];
        $types .= 's';
    } elseif ($assignedTo !== '') {
        $where[] = 'q.assigned_to = ?';
        $params[] = $assignedTo;
        $types .= 's';
    }
    $alert = $_GET['alert'] ?? '';
    if ($alert === 'urgente') $where[] = OPEN_SQL . ' AND ' . DAYS_SQL . ' >= ' . ALERT_URGENT_DAYS;
    elseif ($alert === 'atencion') $where[] = OPEN_SQL . ' AND ' . DAYS_SQL . ' >= ' . ALERT_WARN_DAYS . ' AND ' . DAYS_SQL . ' < ' . ALERT_URGENT_DAYS;
    elseif ($alert === 'aldia') $where[] = OPEN_SQL . ' AND ' . DAYS_SQL . ' < ' . ALERT_WARN_DAYS;
    elseif ($alert === 'activas') $where[] = OPEN_SQL;

    $q = trim((string) ($_GET['q'] ?? ''));
    if ($q !== '') {
        $where[] = '(q.passenger_name LIKE ? OR q.passenger_email LIKE ? OR q.passenger_phone LIKE ?
                     OR q.destination_text LIKE ? OR q.package_title LIKE ? OR q.folio LIKE ?)';
        $like = '%' . $q . '%';
        array_push($params, $like, $like, $like, $like, $like, $like);
        $types .= 'ssssss';
    }

    $order = match ($_GET['sort'] ?? 'recientes') {
        'antiguas' => 'q.created_at ASC',
        'urgencia' => '(' . OPEN_SQL . ') DESC, days_since_contact DESC',
        'monto' => 'COALESCE(q.sale_amount_clp, q.total_clp, q.budget_clp, 0) DESC',
        default => 'q.created_at DESC',
    };
    return [$where, $params, $types, $order];
}

function fetch_summaries(mysqli $mysqli, array $session, ?int $limit = null, int $offset = 0): array {
    [$where, $params, $types, $order] = build_filters($session);
    $sql = SUMMARY_SELECT . (count($where) ? ' WHERE ' . implode(' AND ', $where) : '') . " ORDER BY $order";
    $countSql = 'SELECT COUNT(*) AS n FROM quote_requests q' . (count($where) ? ' WHERE ' . implode(' AND ', $where) : '');

    $stmt = $mysqli->prepare($countSql);
    if ($types !== '') $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $total = (int) $stmt->get_result()->fetch_assoc()['n'];
    $stmt->close();

    if ($limit !== null) $sql .= ' LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset;
    $stmt = $mysqli->prepare($sql);
    if ($types !== '') $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = quote_summary($r);
    $stmt->close();
    return [$rows, $total];
}

function log_activity(mysqli $mysqli, int $quoteId, ?string $authorId, string $kind, string $body): void {
    $stmt = $mysqli->prepare('INSERT INTO quote_activity (quote_id, author_id, kind, body) VALUES (?, ?, ?, ?)');
    $stmt->bind_param('isss', $quoteId, $authorId, $kind, $body);
    $stmt->execute();
    $stmt->close();
}

if ($action === 'list' && $method === 'GET') {
    $perPage = max(1, min(100, (int) ($_GET['perPage'] ?? 25)));
    $page = max(1, (int) ($_GET['page'] ?? 1));
    [$rows, $total] = fetch_summaries($mysqli, $session, $perPage, ($page - 1) * $perPage);
    json_ok(['quotes' => $rows, 'total' => $total, 'page' => $page, 'pages' => max(1, (int) ceil($total / $perPage))]);
}

if ($action === 'export' && $method === 'GET') {
    // CSV para Excel en Chile: separador ';' y UTF-8 con BOM (regla del CRM de Francisco).
    [$rows] = fetch_summaries($mysqli, $session);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="solicitudes-' . date('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, ['Folio', 'Fecha', 'Pasajero', 'Correo', 'Teléfono', 'Ciudad', 'Destino', 'Adultos', 'Niños', 'Canal',
        'Tipo de viaje', 'Estado', 'Responsable', 'Presupuesto', 'Monto venta', 'Días sin contacto'], ';');
    foreach ($rows as $r) {
        fputcsv($out, [$r['folio'], substr($r['createdAt'], 0, 10), $r['passengerName'], $r['passengerEmail'], $r['passengerPhone'],
            $r['originCity'], $r['destination'], $r['adults'], $r['children'], $r['channel'], $r['travelType'],
            STATUS_LABELS[$r['status']] ?? $r['status'], $r['assignedToName'], $r['budgetClp'], $r['saleAmountClp'],
            $r['daysSinceContact']], ';');
    }
    fclose($out);
    exit;
}

if ($action === 'get' && $method === 'GET') {
    $id = (int) ($_GET['id'] ?? 0);
    $stmt = $mysqli->prepare(
        'SELECT q.*, u.name AS assigned_to_name, ' . DAYS_SQL . ' AS days_since_contact
         FROM quote_requests q LEFT JOIN users u ON u.id = q.assigned_to WHERE q.id = ?'
    );
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) json_error('Solicitud no encontrada', 404);

    $stmt = $mysqli->prepare(
        'SELECT a.id, a.kind, a.body, a.created_at, u.name AS author_name
         FROM quote_activity a LEFT JOIN users u ON u.id = a.author_id
         WHERE a.quote_id = ? ORDER BY a.created_at DESC, a.id DESC'
    );
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $res = $stmt->get_result();
    $activity = [];
    while ($a = $res->fetch_assoc()) {
        $activity[] = ['id' => (int) $a['id'], 'kind' => $a['kind'], 'body' => $a['body'],
            'createdAt' => $a['created_at'], 'authorName' => $a['author_name']];
    }
    $stmt->close();

    $details = json_decode($row['details_json'] ?? 'null', true) ?: [];
    unset($details['demo']);

    json_ok(['quote' => quote_summary($row) + [
        'roomOptionLabel' => $row['room_option_label'],
        'selectedAddons' => json_decode($row['selected_addons_json'] ?? '[]', true) ?? [],
        'perPersonBaseClp' => nullable_int($row['per_person_base_clp']),
        'passengersSubtotalClp' => nullable_int($row['passengers_subtotal_clp']),
        'addonsTotalClp' => (int) $row['addons_total_clp'],
        'roomAdjustmentClp' => (int) $row['room_adjustment_clp'],
        'depositSuggestedClp' => nullable_int($row['deposit_suggested_clp']),
        'preferredDateFrom' => $row['preferred_date_from'],
        'preferredDateTo' => $row['preferred_date_to'],
        'comments' => $row['comments'],
        'internalNotes' => $row['internal_notes'],
        'quotedAt' => $row['quoted_at'],
        'closedAt' => $row['closed_at'],
        'details' => $details,
        'activity' => $activity,
    ]]);
}

if ($action === 'update' && $method === 'POST') {
    require_auth('quotes:edit');
    $id = (int) ($_GET['id'] ?? 0);
    $input = json_body();
    $userId = $session['user']['id'];

    $stmt = $mysqli->prepare('SELECT q.status, q.assigned_to, u.name AS assigned_to_name FROM quote_requests q
        LEFT JOIN users u ON u.id = q.assigned_to WHERE q.id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $prev = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$prev) json_error('Solicitud no encontrada', 404);

    $status = $input['status'] ?? $prev['status'];
    if (!in_array($status, QUOTE_STATUSES, true)) json_error('Estado inválido', 400);
    $assignedTo = array_key_exists('assignedTo', $input) ? ($input['assignedTo'] ?: null) : $prev['assigned_to'];
    $notes = array_key_exists('internalNotes', $input) ? (str_field($input, 'internalNotes') ?: null) : null;
    $sale = isset($input['saleAmountClp']) && $input['saleAmountClp'] !== '' ? (int) $input['saleAmountClp'] : null;
    if ($status === 'venta_cerrada' && $prev['status'] !== 'venta_cerrada' && ($sale === null || $sale <= 0)) {
        json_error('Para cerrar la venta indica el monto vendido', 400);
    }

    // Efectos de cada cambio de estado (regla 6 del CRM de Francisco).
    $sets = ['status = ?', 'assigned_to = ?', 'last_contact_at = NOW()'];
    $params = [$status, $assignedTo];
    $types = 'ss';
    if (array_key_exists('internalNotes', $input)) {
        $sets[] = 'internal_notes = ?';
        $params[] = $notes;
        $types .= 's';
    }
    if ($status === 'cotizacion_enviada' && $prev['status'] !== 'cotizacion_enviada') $sets[] = 'quoted_at = COALESCE(quoted_at, NOW())';
    if (in_array($status, ['venta_cerrada', 'no_interesado'], true) && $prev['status'] !== $status) $sets[] = 'closed_at = NOW()';
    if (in_array($status, OPEN_STATUSES, true)) $sets[] = 'closed_at = NULL';
    if ($status === 'venta_cerrada' && $sale !== null) {
        $sets[] = 'sale_amount_clp = ?';
        $params[] = $sale;
        $types .= 'i';
    }
    $params[] = $id;
    $types .= 'i';
    $stmt = $mysqli->prepare('UPDATE quote_requests SET ' . implode(', ', $sets) . ' WHERE id = ?');
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $stmt->close();

    if ($status !== $prev['status']) {
        $body = 'Estado: ' . STATUS_LABELS[$prev['status']] . ' → ' . STATUS_LABELS[$status];
        if ($status === 'venta_cerrada' && $sale !== null) $body .= ' por $' . number_format($sale, 0, ',', '.');
        log_activity($mysqli, $id, $userId, 'estado', $body);
    }
    if ($assignedTo !== $prev['assigned_to']) {
        $name = null;
        if ($assignedTo) {
            $s = $mysqli->prepare('SELECT name FROM users WHERE id = ?');
            $s->bind_param('s', $assignedTo);
            $s->execute();
            $name = $s->get_result()->fetch_assoc()['name'] ?? null;
            $s->close();
        }
        log_activity($mysqli, $id, $userId, 'asignacion', $name ? "Asignada a $name" : 'Quedó sin asignar');
    }
    json_ok([]);
}

if ($action === 'note' && $method === 'POST') {
    require_auth('quotes:edit');
    $id = (int) ($_GET['id'] ?? 0);
    $body = str_field(json_body(), 'body');
    if ($body === '') json_error('Escribe la nota', 400);
    if (mb_strlen($body) > 2000) json_error('La nota es demasiado larga', 400);
    log_activity($mysqli, $id, $session['user']['id'], 'nota', $body);
    // Registrar seguimiento = hubo contacto (regla: actualiza fecha_ultimo_contacto).
    $stmt = $mysqli->prepare('UPDATE quote_requests SET last_contact_at = NOW() WHERE id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
    json_ok([]);
}

if ($action === 'stats' && $method === 'GET') {
    // KPIs del tablero (regla 7 del CRM de Francisco), calculados sobre datos reales.
    $one = fn(string $sql) => $mysqli->query($sql)->fetch_assoc();
    $k = $one('SELECT COUNT(*) AS total,
            SUM(quoted_at IS NOT NULL OR status <> \'nueva\') AS cotizadas,
            SUM(status IN (\'en_seguimiento\',\'respondido\',\'venta_cerrada\')) AS con_respuesta,
            SUM(status = \'venta_cerrada\') AS ventas,
            SUM(status = \'en_seguimiento\') AS seguimiento,
            SUM(' . OPEN_SQL . ') AS activas,
            SUM(' . OPEN_SQL . ' AND ' . DAYS_SQL . ' >= ' . ALERT_URGENT_DAYS . ') AS urgentes,
            SUM(' . OPEN_SQL . ' AND ' . DAYS_SQL . ' >= ' . ALERT_WARN_DAYS . ' AND ' . DAYS_SQL . ' < ' . ALERT_URGENT_DAYS . ') AS atencion,
            COALESCE(SUM(CASE WHEN status = \'venta_cerrada\' THEN sale_amount_clp END), 0) AS ingreso_real,
            COALESCE(SUM(CASE WHEN status IN (\'cotizacion_enviada\',\'en_seguimiento\',\'respondido\') THEN COALESCE(total_clp, budget_clp) END), 0) AS ingreso_potencial,
            AVG(CASE WHEN quoted_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, created_at, quoted_at) / 24 END) AS dias_respuesta
         FROM quote_requests q');
    $mes = $one('SELECT COUNT(*) AS recibidas,
            SUM(quoted_at >= DATE_FORMAT(NOW(), \'%Y-%m-01\')) AS cotizadas,
            SUM(status = \'venta_cerrada\' AND closed_at >= DATE_FORMAT(NOW(), \'%Y-%m-01\')) AS ventas
         FROM quote_requests WHERE created_at >= DATE_FORMAT(NOW(), \'%Y-%m-01\')');
    $vendidoMes = $one('SELECT COALESCE(SUM(sale_amount_clp),0) AS monto, COUNT(*) AS n FROM quote_requests
         WHERE status = \'venta_cerrada\' AND closed_at >= DATE_FORMAT(NOW(), \'%Y-%m-01\')');
    $vendidoMesAnt = $one('SELECT COALESCE(SUM(sale_amount_clp),0) AS monto FROM quote_requests
         WHERE status = \'venta_cerrada\' AND closed_at >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, \'%Y-%m-01\')
           AND closed_at < DATE_FORMAT(NOW(), \'%Y-%m-01\')');

    $group = function (string $col) use ($mysqli) {
        $res = $mysqli->query("SELECT $col AS k, COUNT(*) AS n FROM quote_requests q LEFT JOIN users u ON u.id = q.assigned_to GROUP BY k ORDER BY n DESC");
        $out = [];
        while ($r = $res->fetch_assoc()) $out[] = ['key' => $r['k'], 'count' => (int) $r['n']];
        return $out;
    };
    $res = $mysqli->query('SELECT COALESCE(destination_text, package_title) AS d, COUNT(*) AS n,
            SUM(status = \'venta_cerrada\') AS v FROM quote_requests GROUP BY d ORDER BY n DESC, v DESC LIMIT 8');
    $topDest = [];
    while ($r = $res->fetch_assoc()) $topDest[] = ['destination' => $r['d'], 'count' => (int) $r['n'], 'sales' => (int) $r['v']];

    $total = (int) $k['total'];
    json_ok(['stats' => [
        'total' => $total,
        'quoted' => (int) $k['cotizadas'],
        'responded' => (int) $k['con_respuesta'],
        'sales' => (int) $k['ventas'],
        'followUp' => (int) $k['seguimiento'],
        'active' => (int) $k['activas'],
        'urgent' => (int) $k['urgentes'],
        'warning' => (int) $k['atencion'],
        'revenue' => (int) $k['ingreso_real'],
        'potential' => (int) $k['ingreso_potencial'],
        'avgResponseDays' => $k['dias_respuesta'] !== null ? round((float) $k['dias_respuesta'], 1) : null,
        'conversion' => $total > 0 ? round($k['ventas'] / $total * 100, 1) : 0,
        'conversionQuoted' => $k['cotizadas'] > 0 ? round($k['ventas'] / $k['cotizadas'] * 100, 1) : 0,
        'avgTicket' => $k['ventas'] > 0 ? (int) round($k['ingreso_real'] / $k['ventas']) : 0,
        'month' => [
            'received' => (int) $mes['recibidas'],
            'quoted' => (int) $mes['cotizadas'],
            'sales' => (int) $vendidoMes['n'],
            'sold' => (int) $vendidoMes['monto'],
            'soldPrev' => (int) $vendidoMesAnt['monto'],
            'goal' => 22000000, // meta mensual del plan de trabajo (CRM Francisco); editable a futuro desde el panel
            'day' => (int) date('j'),
            'daysInMonth' => (int) date('t'),
        ],
        'byStatus' => $group('q.status'),
        'byChannel' => $group('q.channel'),
        'byOwner' => $group("COALESCE(u.name, 'Sin asignar')"),
        'byTravelType' => $group("COALESCE(q.travel_type, 'Sin indicar')"),
        'topDestinations' => $topDest,
    ]]);
}

if ($action === 'counts' && $method === 'GET') {
    // liviano, para los badges de la navegación del panel
    $row = $mysqli->query('SELECT SUM(q.status = \'nueva\') AS nuevas,
            SUM(' . OPEN_SQL . ' AND ' . DAYS_SQL . ' >= ' . ALERT_URGENT_DAYS . ') AS urgentes
        FROM quote_requests q')->fetch_assoc();
    json_ok(['nuevas' => (int) $row['nuevas'], 'urgentes' => (int) $row['urgentes']]);
}

if ($action === 'users' && $method === 'GET') {
    // lista liviana para el selector de "responsable"
    $res = $mysqli->query('SELECT id, name FROM users WHERE is_active = 1 ORDER BY name');
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = $r;
    json_ok(['users' => $rows]);
}

json_error('Ruta no encontrada', 404);
