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
                (SELECT COUNT(*) FROM quote_requests q WHERE q.client_id = c.id) AS quotes_count
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
        'SELECT id, created_at, package_title, status, total_clp
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
