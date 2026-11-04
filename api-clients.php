<?php
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
install_json_error_handlers();

$session = require_auth('clients:view');
$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'];
$mysqli = db();

if ($action === 'list' && $method === 'GET') {
    $res = $mysqli->query(
        "SELECT c.id, c.name, c.email, c.phone, c.email_verified_at, c.created_at, c.last_login_at,
                (SELECT COUNT(*) FROM quote_requests q WHERE q.client_id = c.id) AS quotes_count,
                (SELECT COUNT(*) FROM quote_requests q WHERE q.client_id = c.id AND q.recovered = 1) AS recovered_count,
                (SELECT COUNT(*) FROM quote_requests q WHERE q.client_id = c.id AND q.recovered = 1 AND q.status = 'nueva' AND q.last_contact_at IS NULL) AS pending_count,
                (SELECT COUNT(*) FROM quote_requests q WHERE q.client_id = c.id AND q.recovered = 1 AND q.request_type = 'problema') AS posventa_count,
                (SELECT q.destination_text FROM quote_requests q WHERE q.client_id = c.id ORDER BY q.created_at DESC LIMIT 1) AS last_destination,
                (SELECT MIN(q.created_at) FROM quote_requests q WHERE q.client_id = c.id) AS first_request_at
         FROM clients c
         ORDER BY c.created_at DESC"
    );
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $rows[] = [
            'id' => $r['id'],
            'name' => $r['name'],
            'email' => $r['email'],
            'phone' => $r['phone'],
            'emailVerified' => $r['email_verified_at'] !== null,
            'createdAt' => $r['created_at'],
            'lastLoginAt' => $r['last_login_at'],
            'quotesCount' => (int) $r['quotes_count'],
            'recovered' => (int) $r['recovered_count'] > 0,
            'pending' => (int) $r['pending_count'] > 0,
            'posventa' => (int) $r['posventa_count'] > 0,
            'lastDestination' => $r['last_destination'],
            'firstRequestAt' => $r['first_request_at'],
        ];
    }
    json_ok(['clients' => $rows]);
}

if ($action === 'get' && $method === 'GET') {
    $id = $_GET['id'] ?? '';
    $stmt = $mysqli->prepare('SELECT * FROM clients WHERE id = ?');
    $stmt->bind_param('s', $id);
    $stmt->execute();
    $client = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$client) json_error('Cliente no encontrado', 404);

    $stmt = $mysqli->prepare(
        'SELECT id, created_at, COALESCE(package_title, destination_text, \'Solicitud\') AS package_title, status, total_clp
         FROM quote_requests WHERE client_id = ? ORDER BY created_at DESC'
    );
    $stmt->bind_param('s', $id);
    $stmt->execute();
    $res = $stmt->get_result();
    $quotes = [];
    while ($r = $res->fetch_assoc()) {
        $quotes[] = [
            'id' => (int) $r['id'],
            'createdAt' => $r['created_at'],
            'packageTitle' => $r['package_title'],
            'status' => $r['status'],
            'totalClp' => $r['total_clp'] !== null ? (int) $r['total_clp'] : null,
        ];
    }
    $stmt->close();

    json_ok(['client' => [
        'id' => $client['id'],
        'name' => $client['name'],
        'email' => $client['email'],
        'phone' => $client['phone'],
        'emailVerified' => $client['email_verified_at'] !== null,
        'hasPassword' => $client['password_hash'] !== null,
        'hasGoogle' => $client['google_sub'] !== null,
        'createdAt' => $client['created_at'],
        'lastLoginAt' => $client['last_login_at'],
        'internalNotes' => $client['internal_notes'],
    ], 'quotes' => $quotes]);
}

if ($action === 'update' && $method === 'POST') {
    require_auth('clients:edit');
    $id = $_GET['id'] ?? '';
    $input = json_body();
    $notes = str_field($input, 'internalNotes') ?: null;

    $stmt = $mysqli->prepare('UPDATE clients SET internal_notes = ? WHERE id = ?');
    $stmt->bind_param('ss', $notes, $id);
    $stmt->execute();
    $stmt->close();
    json_ok();
}

json_error('Ruta no encontrada', 404);
