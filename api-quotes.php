<?php
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
install_json_error_handlers();

$session = require_auth('quotes:view');
$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'];
$mysqli = db();

if ($action === 'list' && $method === 'GET') {
    $res = $mysqli->query(
        'SELECT q.id, q.created_at, q.package_slug, q.package_title,
                q.passenger_name, q.passenger_email, q.total_clp, q.status,
                u.name AS assigned_to_name
         FROM quote_requests q LEFT JOIN users u ON u.id = q.assigned_to
         ORDER BY q.created_at DESC'
    );
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $rows[] = [
            'id' => (int) $r['id'],
            'createdAt' => $r['created_at'],
            'packageSlug' => $r['package_slug'],
            'packageTitle' => $r['package_title'],
            'passengerName' => $r['passenger_name'],
            'passengerEmail' => $r['passenger_email'],
            'totalClp' => $r['total_clp'] !== null ? (int) $r['total_clp'] : null,
            'status' => $r['status'],
            'assignedToName' => $r['assigned_to_name'],
        ];
    }
    json_ok(['quotes' => $rows]);
}

if ($action === 'get' && $method === 'GET') {
    $id = (int) ($_GET['id'] ?? 0);
    $stmt = $mysqli->prepare(
        'SELECT q.*, u.name AS assigned_to_name FROM quote_requests q
         LEFT JOIN users u ON u.id = q.assigned_to WHERE q.id = ?'
    );
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) json_error('Cotización no encontrada', 404);

    json_ok(['quote' => [
        'id' => (int) $row['id'],
        'createdAt' => $row['created_at'],
        'packageSlug' => $row['package_slug'],
        'packageTitle' => $row['package_title'],
        'passengerName' => $row['passenger_name'],
        'passengerEmail' => $row['passenger_email'],
        'totalClp' => $row['total_clp'] !== null ? (int) $row['total_clp'] : null,
        'status' => $row['status'],
        'assignedToName' => $row['assigned_to_name'],
        'adults' => (int) $row['adults'],
        'children' => (int) $row['children'],
        'roomOptionLabel' => $row['room_option_label'],
        'selectedAddons' => json_decode($row['selected_addons_json'], true) ?? [],
        'perPersonBaseClp' => $row['per_person_base_clp'] !== null ? (int) $row['per_person_base_clp'] : null,
        'passengersSubtotalClp' => $row['passengers_subtotal_clp'] !== null ? (int) $row['passengers_subtotal_clp'] : null,
        'addonsTotalClp' => (int) $row['addons_total_clp'],
        'roomAdjustmentClp' => (int) $row['room_adjustment_clp'],
        'depositSuggestedClp' => $row['deposit_suggested_clp'] !== null ? (int) $row['deposit_suggested_clp'] : null,
        'preferredDateFrom' => $row['preferred_date_from'],
        'preferredDateTo' => $row['preferred_date_to'],
        'passengerPhone' => $row['passenger_phone'],
        'comments' => $row['comments'],
        'internalNotes' => $row['internal_notes'],
        'assignedTo' => $row['assigned_to'],
    ]]);
}

if ($action === 'update' && $method === 'POST') {
    require_auth('quotes:edit');
    $id = (int) ($_GET['id'] ?? 0);
    $input = json_body();
    $status = $input['status'] ?? 'nueva';
    $notes = str_field($input, 'internalNotes') ?: null;
    $assignedTo = $input['assignedTo'] ?: null;

    $validStatus = ['nueva', 'en_proceso', 'ganada', 'perdida'];
    if (!in_array($status, $validStatus, true)) json_error('Estado inválido', 400);

    $stmt = $mysqli->prepare('UPDATE quote_requests SET status=?, internal_notes=?, assigned_to=? WHERE id=?');
    $stmt->bind_param('sssi', $status, $notes, $assignedTo, $id);
    $stmt->execute();
    $stmt->close();
    json_ok([]);
}

if ($action === 'users' && $method === 'GET') {
    // lista liviana para el selector de "asignar a"
    $res = $mysqli->query('SELECT id, name FROM users WHERE is_active = 1 ORDER BY name');
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = $r;
    json_ok(['users' => $rows]);
}

json_error('Ruta no encontrada', 404);
