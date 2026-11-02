<?php
// Solicitudes (CRM) — cotizaciones de paquetes, viajes a medida, llamadas, etc.
// Reglas de negocio tomadas del CRM de Francisco (03-reglas-de-negocio.md):
// 6 estados, alertas por horas sin contacto (por defecto 24 h atención/naranja, 48 h urgente/rojo; editables), KPIs.
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
require_once __DIR__ . '/inc/channels.php';
install_json_error_handlers();

$session = require_auth();
$fullAccess = can($session['user'], 'quotes:view');
// Rol 'reportes': solo ventas cerradas, sin datos de contacto ni tablero operativo.
if (!$fullAccess && !can($session['user'], 'reports:view')) json_error('No autorizado', 403);
$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'];
$mysqli = db();

const QUOTE_STATUSES = ['nueva', 'cotizacion_enviada', 'en_seguimiento', 'respondido', 'venta_cerrada', 'no_interesado'];
const OPEN_STATUSES = ['nueva', 'cotizacion_enviada', 'en_seguimiento', 'respondido'];
const QUOTE_BRANDS = ['travel_online', 'travel_viajes'];
const QUOTE_CHANNELS = ['web', 'telefono', 'whatsapp', 'asistente', 'instagram', 'correo', 'referido', 'otro'];
const STATUS_LABELS = [
    'nueva' => 'Nueva', 'cotizacion_enviada' => 'Cotización enviada', 'en_seguimiento' => 'En seguimiento',
    'respondido' => 'Respondido', 'venta_cerrada' => 'Venta cerrada', 'no_interesado' => 'No interesado',
];
const ALERT_DEFAULT_WARN_HOURS = 24;
const ALERT_DEFAULT_URGENT_HOURS = 48;

// Umbrales de alerta en horas, editables en crm_settings (alert_warn_hours / alert_urgent_hours).
function alert_settings(mysqli $m): array {
    $v = ['alert_warn_hours' => ALERT_DEFAULT_WARN_HOURS, 'alert_urgent_hours' => ALERT_DEFAULT_URGENT_HOURS];
    $res = $m->query("SELECT k, v FROM crm_settings WHERE k IN ('alert_warn_hours','alert_urgent_hours')");
    while ($r = $res->fetch_assoc()) $v[$r['k']] = (int) $r['v'];
    $warn = max(1, min(720, $v['alert_warn_hours']));
    $urgent = max($warn + 1, min(2160, $v['alert_urgent_hours']));
    return ['warnHours' => $warn, 'urgentHours' => $urgent];
}
$alertCfg = alert_settings($mysqli);
define('ALERT_WARN_HOURS', $alertCfg['warnHours']);
define('ALERT_URGENT_HOURS', $alertCfg['urgentHours']);

// Tiempo sin contacto calculado en SQL, para filtrar y ordenar por urgencia.
const DAYS_SQL = 'TIMESTAMPDIFF(DAY, COALESCE(q.last_contact_at, q.created_at), NOW())';
const HOURS_SQL = 'TIMESTAMPDIFF(HOUR, COALESCE(q.last_contact_at, q.created_at), NOW())';
const OPEN_SQL = "q.status IN ('nueva','cotizacion_enviada','en_seguimiento','respondido')";

function alert_level(string $status, int $hours): string {
    if (!in_array($status, OPEN_STATUSES, true)) return 'cerrado';
    if ($hours >= ALERT_URGENT_HOURS) return 'urgente';
    if ($hours >= ALERT_WARN_HOURS) return 'atencion';
    return 'aldia';
}


function nullable_int($v): ?int { return $v !== null ? (int) $v : null; }

function quote_summary(array $r): array {
    $days = (int) $r['days_since_contact'];
    $hours = (int) $r['hours_since_contact'];
    $full = can(current_session()['user'] ?? null, 'quotes:view');
    return [
        'id' => (int) $r['id'],
        'folio' => $r['folio'],
        'requestType' => $r['request_type'],
        'channel' => $r['channel'],
        'brand' => $r['brand'],
        'createdAt' => $r['created_at'],
        'packageSlug' => $r['package_slug'],
        'packageTitle' => $r['package_title'],
        'destination' => $r['destination_text'] ?: $r['package_title'],
        'originCity' => $r['origin_city'],
        'travelType' => $r['travel_type'],
        'adults' => (int) $r['adults'],
        'children' => (int) $r['children'],
        'passengerName' => $r['passenger_name'],
        'passengerEmail' => $full ? $r['passenger_email'] : null,
        'passengerPhone' => $full ? $r['passenger_phone'] : null,
        'totalClp' => nullable_int($r['total_clp']),
        'budgetClp' => nullable_int($r['budget_clp']),
        'budgetRange' => $r['budget_range'],
        'saleAmountClp' => nullable_int($r['sale_amount_clp']),
        'status' => $r['status'],
        'assignedTo' => $r['assigned_to'],
        'assignedToName' => $r['assigned_to_name'],
        'lastContactAt' => $r['last_contact_at'],
        'daysSinceContact' => $days,
        'hoursSinceContact' => $hours,
        'alert' => alert_level($r['status'], $hours),
        'quoteDue' => $r['quote_due'] ?? null,
        'quoteOverdue' => ($r['quote_due'] ?? null) !== null && $r['quote_due'] < date('Y-m-d'),
    ];
}

const SUMMARY_SELECT = 'SELECT q.id, q.folio, q.request_type, q.channel, q.brand, q.created_at, q.package_slug, q.package_title,
        q.destination_text, q.origin_city, q.travel_type, q.adults, q.children, q.passenger_name, q.passenger_email,
        q.passenger_phone, q.total_clp, q.budget_clp, q.budget_range, q.sale_amount_clp, q.status, q.assigned_to,
        q.last_contact_at, u.name AS assigned_to_name, ' . DAYS_SQL . ' AS days_since_contact, ' . HOURS_SQL . ' AS hours_since_contact, pq.quote_due
     FROM quote_requests q LEFT JOIN users u ON u.id = q.assigned_to
     LEFT JOIN (SELECT qn.request_id, MIN(qv.promised_at) AS quote_due FROM quotations qn
        JOIN quotation_versions qv ON qv.quotation_id = qn.id AND qv.status = \'borrador\' AND qv.promised_at IS NOT NULL
        GROUP BY qn.request_id) pq ON pq.request_id = q.id';

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
    $brand = $_GET['brand'] ?? '';
    if (in_array($brand, QUOTE_BRANDS, true)) {
        $where[] = 'q.brand = ?';
        $params[] = $brand;
        $types .= 's';
    }
    if (!can($session['user'], 'quotes:view')) $where[] = "q.status = 'venta_cerrada'";
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
    if ($alert === 'urgente') $where[] = OPEN_SQL . ' AND ' . HOURS_SQL . ' >= ' . ALERT_URGENT_HOURS;
    elseif ($alert === 'atencion') $where[] = OPEN_SQL . ' AND ' . HOURS_SQL . ' >= ' . ALERT_WARN_HOURS . ' AND ' . HOURS_SQL . ' < ' . ALERT_URGENT_HOURS;
    elseif ($alert === 'aldia') $where[] = OPEN_SQL . ' AND ' . HOURS_SQL . ' < ' . ALERT_WARN_HOURS;
    elseif ($alert === 'activas') $where[] = OPEN_SQL;

    // Cotización comprometida pendiente (borrador con plazo): "pendientes" = todas, "vencidas" = plazo ya pasado.
    $due = $_GET['due'] ?? '';
    if ($due === 'pendientes') $where[] = 'pq.quote_due IS NOT NULL';
    elseif ($due === 'vencidas') $where[] = 'pq.quote_due < CURDATE()';

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
        'urgencia' => '(' . OPEN_SQL . ') DESC, hours_since_contact DESC',
        'monto' => 'COALESCE(q.sale_amount_clp, q.total_clp, q.budget_clp, 0) DESC',
        default => 'q.created_at DESC',
    };
    return [$where, $params, $types, $order];
}

function fetch_summaries(mysqli $mysqli, array $session, ?int $limit = null, int $offset = 0): array {
    [$where, $params, $types, $order] = build_filters($session);
    $sql = SUMMARY_SELECT . (count($where) ? ' WHERE ' . implode(' AND ', $where) : '') . " ORDER BY $order";
    $countSql = 'SELECT COUNT(*) AS n FROM quote_requests q LEFT JOIN (SELECT qn.request_id, MIN(qv.promised_at) AS quote_due FROM quotations qn JOIN quotation_versions qv ON qv.quotation_id = qn.id AND qv.status = \'borrador\' AND qv.promised_at IS NOT NULL GROUP BY qn.request_id) pq ON pq.request_id = q.id' . (count($where) ? ' WHERE ' . implode(' AND ', $where) : '');

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
        'Marca', 'Tipo de viaje', 'Estado', 'Responsable', 'Presupuesto', 'Monto venta', 'Días sin contacto'], ';');
    foreach ($rows as $r) {
        fputcsv($out, [$r['folio'], substr($r['createdAt'], 0, 10), $r['passengerName'], $r['passengerEmail'], $r['passengerPhone'],
            $r['originCity'], $r['destination'], $r['adults'], $r['children'], $r['channel'], $r['brand'], $r['travelType'],
            STATUS_LABELS[$r['status']] ?? $r['status'], $r['assignedToName'], $r['budgetClp'], $r['saleAmountClp'],
            $r['daysSinceContact']], ';');
    }
    fclose($out);
    exit;
}

// Historial del mismo cliente (por correo o teléfono): otras compras y solicitudes, sin contar esta.
function loyalty_for(mysqli $m, array $row): array {
    $key = strtolower(trim((string) $row['passenger_email']));
    $phone = preg_replace('/[^0-9]/', '', (string) $row['passenger_phone']);
    if ($key === '' && $phone === '') return ['purchases' => 0, 'requests' => 0, 'totalClp' => 0, 'referred' => 0];
    $s = $m->prepare("SELECT COUNT(*) AS n, COALESCE(SUM(status = 'venta_cerrada'), 0) AS p,
        COALESCE(SUM(CASE WHEN status = 'venta_cerrada' THEN sale_amount_clp END), 0) AS t FROM quote_requests
        WHERE id <> ? AND ((? <> '' AND LOWER(TRIM(passenger_email)) = ?) OR (? <> '' AND REPLACE(REPLACE(REPLACE(REPLACE(passenger_phone,' ',''),'+',''),'-',''),'(','') = ?))");
    $s->bind_param('issss', $row['id'], $key, $key, $phone, $phone);
    $s->execute();
    $r = $s->get_result()->fetch_assoc();
    $s->close();
    $referred = 0;
    if ($key !== '') {
        $s = $m->prepare('SELECT COUNT(*) AS n FROM quote_requests WHERE LOWER(TRIM(referred_by_email)) = ?');
        $s->bind_param('s', $key);
        $s->execute();
        $referred = (int) $s->get_result()->fetch_assoc()['n'];
        $s->close();
    }
    return ['purchases' => (int) $r['p'], 'requests' => (int) $r['n'], 'totalClp' => (int) $r['t'], 'referred' => $referred];
}

if ($action === 'get' && $method === 'GET') {
    $id = (int) ($_GET['id'] ?? 0);
    $stmt = $mysqli->prepare(
        'SELECT q.*, u.name AS assigned_to_name, ' . DAYS_SQL . ' AS days_since_contact, ' . HOURS_SQL . ' AS hours_since_contact
         FROM quote_requests q LEFT JOIN users u ON u.id = q.assigned_to WHERE q.id = ?'
    );
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row || (!$fullAccess && $row['status'] !== 'venta_cerrada')) json_error('Solicitud no encontrada', 404);
    if (!$fullAccess) json_error('No autorizado', 403);

    $stmt = $mysqli->prepare(
        'SELECT a.id, a.kind, a.body, a.created_at, u.name AS author_name, t.name AS to_name, a.to_user_id, a.read_at, a.quotation_version_id
         FROM quote_activity a LEFT JOIN users u ON u.id = a.author_id LEFT JOIN users t ON t.id = a.to_user_id
         WHERE a.quote_id = ? ORDER BY a.created_at DESC, a.id DESC'
    );
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $res = $stmt->get_result();
    $activity = [];
    while ($a = $res->fetch_assoc()) {
        $activity[] = ['id' => (int) $a['id'], 'kind' => $a['kind'], 'body' => $a['body'],
            'createdAt' => $a['created_at'], 'authorName' => $a['author_name'],
            'toUserId' => $a['to_user_id'], 'toName' => $a['to_name'], 'readAt' => $a['read_at'],
            'versionId' => $a['quotation_version_id'] !== null ? (int) $a['quotation_version_id'] : null];
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
        'referredByEmail' => $row['referred_by_email'],
        'loyalty' => loyalty_for($mysqli, $row),
        'operatorId' => $row['operator_id'] !== null ? (int) $row['operator_id'] : null,
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

    $stmt = $mysqli->prepare('SELECT q.status, q.assigned_to, q.operator_id, u.name AS assigned_to_name FROM quote_requests q
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
    if (isset($input['brand'])) {
        if (!in_array($input['brand'], QUOTE_BRANDS, true)) json_error('Marca inválida', 400);
        $sets[] = 'brand = ?';
        $params[] = $input['brand'];
        $types .= 's';
    }
    if (array_key_exists('internalNotes', $input)) {
        $sets[] = 'internal_notes = ?';
        $params[] = $notes;
        $types .= 's';
    }
    if ($status === 'cotizacion_enviada' && $prev['status'] !== 'cotizacion_enviada') $sets[] = 'quoted_at = COALESCE(quoted_at, NOW())';
    if (in_array($status, ['venta_cerrada', 'no_interesado'], true) && $prev['status'] !== $status) $sets[] = 'closed_at = NOW()';
    if (in_array($status, OPEN_STATUSES, true)) $sets[] = 'closed_at = NULL';
    if (array_key_exists('referredByEmail', $input)) {
        $ref = strtolower(trim((string) $input['referredByEmail']));
        if ($ref !== '' && !filter_var($ref, FILTER_VALIDATE_EMAIL)) json_error('El correo de quien refirió no es válido', 400);
        $sets[] = 'referred_by_email = ?';
        $params[] = $ref !== '' ? $ref : null;
        $types .= 's';
    }
    // Operador de la venta y % de comisión congelado al cerrar.
    $operatorId = array_key_exists('operatorId', $input) ? ((int) $input['operatorId'] ?: null) : ($prev['operator_id'] !== null ? (int) $prev['operator_id'] : null);
    if ($operatorId !== null) {
        $o = $mysqli->prepare('SELECT commission_pct FROM operators WHERE id = ?');
        $o->bind_param('i', $operatorId);
        $o->execute();
        $op = $o->get_result()->fetch_assoc();
        $o->close();
        if (!$op) json_error('Operador no válido', 400);
    }
    if (array_key_exists('operatorId', $input)) {
        $sets[] = 'operator_id = ?';
        $params[] = $operatorId;
        $types .= 'i';
    }
    if ($status === 'venta_cerrada') {
        $sets[] = 'commission_pct = ?';
        $params[] = $operatorId !== null && $op['commission_pct'] !== null ? (float) $op['commission_pct'] : null;
        $types .= 'd';
    }
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

// Alta manual: llamada, WhatsApp, correo, etc. (formulario de recepción de Carolina, ahora dentro del CRM).
if ($action === 'create' && $method === 'POST') {
    require_auth('quotes:edit');
    $in = json_body();
    $userId = $session['user']['id'];
    $reason = $in['reason'] ?? '';
    $typeMap = ['viaje' => 'a_medida', 'reunion' => 'reunion', 'problema' => 'problema'];
    if (!isset($typeMap[$reason])) json_error('Indica el motivo de la solicitud', 400);
    $channel = $in['channel'] ?? '';
    if (!in_array($channel, ['telefono', 'whatsapp', 'correo', 'instagram', 'referido', 'otro'], true)) json_error('Indica por qué canal llegó', 400);
    $brand = in_array($in['brand'] ?? '', QUOTE_BRANDS, true) ? $in['brand'] : 'travel_online';
    $name = mb_substr(str_field($in, 'name'), 0, 255);
    $phone = mb_substr(str_field($in, 'phone'), 0, 64);
    $email = mb_strtolower(str_field($in, 'email'));
    if ($name === '') json_error('El nombre es obligatorio', 400);
    if ($phone === '' && $email === '') json_error('Anota un teléfono o un correo para poder contactar', 400);
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('El correo no es válido', 400);

    $text = fn(string $k, int $max = 500) => mb_substr(str_field($in, $k), 0, $max);
    $adults = max(0, min(50, (int) ($in['adults'] ?? 1)));
    $children = max(0, min(50, (int) ($in['children'] ?? 0)));
    $details = array_filter([
        'cuando' => $text('dates'), 'edades' => $text('ages'), 'programa' => $text('program'),
        'tema' => $text('meetingTopic'), 'tieneCotizacion' => $text('hasQuote', 20), 'disponibilidad' => $text('availability'),
        'agencia' => $text('agency'), 'reserva' => $text('booking'), 'viajando' => $text('travelling', 20),
    ], fn($v) => $v !== '');
    $comments = $reason === 'problema' ? $text('issue', 4000) : ($reason === 'reunion' ? $text('meetingTopic', 4000) : $text('notes', 4000));
    if ($reason === 'problema' && $comments === '') json_error('Anota qué ocurrió', 400);
    $dest = $text('destination', 190) ?: ($reason === 'viaje' ? null : ($reason === 'reunion' ? 'Reunión' : 'Problema con un viaje'));
    $origin = $text('originCity', 120) ?: null;
    $budget = isset($in['budgetClp']) && $in['budgetClp'] !== '' ? max(0, (int) $in['budgetClp']) : null;
    $detailsJson = $details ? json_encode($details, JSON_UNESCAPED_UNICODE) : null;
    $emailOrNull = $email !== '' ? $email : null;
    $commentsOrNull = $comments !== '' ? $comments : null;
    $assigned = ($in['assignedTo'] ?? '') ?: null;
    $ref = strtolower(trim((string) ($in['referredByEmail'] ?? '')));
    $refOrNull = $ref !== '' && filter_var($ref, FILTER_VALIDATE_EMAIL) ? $ref : null;
    $rtype = $typeMap[$reason];

    $stmt = $mysqli->prepare("INSERT INTO quote_requests (request_type, channel, brand, referred_by_email, destination_text, origin_city, budget_clp, adults, children,
        selected_addons_json, passenger_name, passenger_email, passenger_phone, comments, details_json, assigned_to, received_by, last_contact_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, NOW())");
    $stmt->bind_param('ssssssiiisssssss', $rtype, $channel, $brand, $refOrNull, $dest, $origin, $budget, $adults, $children,
        $name, $emailOrNull, $phone, $commentsOrNull, $detailsJson, $assigned, $userId);
    $stmt->execute();
    $id = $stmt->insert_id;
    $stmt->close();
    $folio = sprintf('TOL-%s-%04d', (new DateTime('now', new DateTimeZone('America/Santiago')))->format('ymd'), $id % 10000);
    $stmt = $mysqli->prepare('UPDATE quote_requests SET folio = ? WHERE id = ?');
    $stmt->bind_param('si', $folio, $id);
    $stmt->execute();
    $stmt->close();
    log_activity($mysqli, $id, $userId, 'sistema', 'Solicitud registrada por ' . $session['user']['name'] . ' · canal: ' . ($channel === 'telefono' ? 'teléfono' : $channel));
    if ($assigned) {
        $s = $mysqli->prepare('SELECT name FROM users WHERE id = ?');
        $s->bind_param('s', $assigned);
        $s->execute();
        $an = $s->get_result()->fetch_assoc()['name'] ?? null;
        $s->close();
        if ($an) log_activity($mysqli, $id, $userId, 'asignacion', "Asignada a $an");
    }
    json_ok(['id' => $id, 'folio' => $folio]);
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

if ($action === 'message' && $method === 'POST') {
    // Mensaje interno entre ejecutivas, dentro de la solicitud. No cuenta como contacto con el cliente.
    require_auth('messages:send');
    $id = (int) ($_GET['id'] ?? 0);
    $input = json_body();
    $body = str_field($input, 'body');
    if ($body === '') json_error('Escribe el mensaje', 400);
    if (mb_strlen($body) > 2000) json_error('El mensaje es demasiado largo', 400);
    $to = ($input['toUserId'] ?? '') ?: null;
    if ($to !== null) {
        $s = $mysqli->prepare('SELECT id FROM users WHERE id = ? AND is_active = 1');
        $s->bind_param('s', $to);
        $s->execute();
        if (!$s->get_result()->fetch_assoc()) json_error('Destinataria no válida', 400);
        $s->close();
    }
    $s = $mysqli->prepare('SELECT id FROM quote_requests WHERE id = ?');
    $s->bind_param('i', $id);
    $s->execute();
    if (!$s->get_result()->fetch_assoc()) json_error('Solicitud no encontrada', 404);
    $s->close();
    $author = $session['user']['id'];
    $stmt = $mysqli->prepare("INSERT INTO quote_activity (quote_id, author_id, to_user_id, kind, body) VALUES (?, ?, ?, 'mensaje', ?)");
    $stmt->bind_param('isss', $id, $author, $to, $body);
    $stmt->execute();
    $stmt->close();
    json_ok([]);
}

if ($action === 'inbox' && $method === 'GET') {
    // Mensajes dirigidos a mí y sin leer (badge de la navegación).
    require_auth('quotes:view');
    $uid = $session['user']['id'];
    $stmt = $mysqli->prepare("SELECT a.quote_id AS id, q.folio, a.body, a.created_at, u.name AS author_name
        FROM quote_activity a JOIN quote_requests q ON q.id = a.quote_id LEFT JOIN users u ON u.id = a.author_id
        WHERE a.kind = 'mensaje' AND a.to_user_id = ? AND a.read_at IS NULL ORDER BY a.created_at DESC LIMIT 50");
    $stmt->bind_param('s', $uid);
    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = ['quoteId' => (int) $r['id'], 'folio' => $r['folio'], 'body' => $r['body'],
        'createdAt' => $r['created_at'], 'authorName' => $r['author_name']];
    json_ok(['unread' => count($rows), 'messages' => $rows]);
}

if ($action === 'mark_read' && $method === 'POST') {
    require_auth('quotes:view');
    $id = (int) ($_GET['id'] ?? 0);
    $uid = $session['user']['id'];
    $stmt = $mysqli->prepare("UPDATE quote_activity SET read_at = NOW() WHERE quote_id = ? AND to_user_id = ? AND kind = 'mensaje' AND read_at IS NULL");
    $stmt->bind_param('is', $id, $uid);
    $stmt->execute();
    json_ok([]);
}

if ($action === 'stats' && $method === 'GET') {
    require_auth('quotes:view');
    // KPIs del tablero (regla 7 del CRM de Francisco), calculados sobre datos reales.
    $one = fn(string $sql) => $mysqli->query($sql)->fetch_assoc();
    $k = $one('SELECT COUNT(*) AS total,
            SUM(quoted_at IS NOT NULL OR status <> \'nueva\') AS cotizadas,
            SUM(status IN (\'en_seguimiento\',\'respondido\',\'venta_cerrada\')) AS con_respuesta,
            SUM(status = \'venta_cerrada\') AS ventas,
            SUM(status = \'en_seguimiento\') AS seguimiento,
            SUM(' . OPEN_SQL . ') AS activas,
            SUM(' . OPEN_SQL . ' AND ' . HOURS_SQL . ' >= ' . ALERT_URGENT_HOURS . ') AS urgentes,
            SUM(' . OPEN_SQL . ' AND ' . HOURS_SQL . ' >= ' . ALERT_WARN_HOURS . ' AND ' . HOURS_SQL . ' < ' . ALERT_URGENT_HOURS . ') AS atencion,
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
        'alert' => $alertCfg,
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
    require_auth('quotes:view');
    // liviano, para los badges de la navegación del panel
    $venc = (int) $mysqli->query('SELECT COUNT(DISTINCT qn.request_id) AS n FROM quotations qn JOIN quotation_versions qv ON qv.quotation_id = qn.id
        WHERE qv.status = \'borrador\' AND qv.promised_at < CURDATE()')->fetch_assoc()['n'];
    $row = $mysqli->query('SELECT SUM(q.status = \'nueva\') AS nuevas,
            SUM(' . OPEN_SQL . ' AND ' . HOURS_SQL . ' >= ' . ALERT_URGENT_HOURS . ') AS urgentes
        FROM quote_requests q')->fetch_assoc();
    json_ok(['nuevas' => (int) $row['nuevas'], 'urgentes' => (int) $row['urgentes'], 'cotVencidas' => $venc, 'alert' => $alertCfg,
        'canalesSilencio' => count(array_filter(channel_health($mysqli), fn($c) => $c['silent']))]);
}

if ($action === 'alert_settings' && $method === 'POST') {
    require_auth('settings:manage');
    $in = json_body();
    $warn = (int) ($in['warnHours'] ?? 0);
    $urgent = (int) ($in['urgentHours'] ?? 0);
    if ($warn < 1 || $warn > 720) json_error('El aviso naranja debe estar entre 1 y 720 horas', 400);
    if ($urgent <= $warn || $urgent > 2160) json_error('El aviso rojo debe ser mayor que el naranja (máximo 2160 horas)', 400);
    $s = $mysqli->prepare('INSERT INTO crm_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)');
    foreach (['alert_warn_hours' => $warn, 'alert_urgent_hours' => $urgent] as $k => $n) {
        $v = (string) $n;
        $s->bind_param('ss', $k, $v);
        $s->execute();
    }
    json_ok(['alert' => ['warnHours' => $warn, 'urgentHours' => $urgent]]);
}

if ($action === 'users' && $method === 'GET') {
    require_auth('quotes:view');
    // lista liviana para el selector de "responsable"
    $res = $mysqli->query('SELECT id, name FROM users WHERE is_active = 1 ORDER BY name');
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = $r;
    json_ok(['users' => $rows]);
}

json_error('Ruta no encontrada', 404);
