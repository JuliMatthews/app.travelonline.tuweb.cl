<?php
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
install_json_error_handlers();

$session = require_auth('pages:view');
$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'];
$mysqli = db();

if ($action === 'list' && $method === 'GET') {
    $res = $mysqli->query('SELECT id, slug, title, updated_at FROM static_pages ORDER BY slug');
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = $r;
    json_ok(['pages' => $rows]);
}

if ($action === 'get' && $method === 'GET') {
    $slug = $_GET['slug'] ?? '';
    $stmt = $mysqli->prepare('SELECT id, slug, title, content, updated_at FROM static_pages WHERE slug = ?');
    $stmt->bind_param('s', $slug);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) json_error('Página no encontrada', 404);
    json_ok(['page' => $row]);
}

if ($action === 'update' && $method === 'POST') {
    require_auth('pages:edit');
    $slug = $_GET['slug'] ?? '';
    $input = json_body();
    $title = str_field($input, 'title');
    $content = $input['content'] ?? '';
    $userId = $session['user']['id'];

    $stmt = $mysqli->prepare('UPDATE static_pages SET title=?, content=?, updated_by=? WHERE slug=?');
    $stmt->bind_param('ssss', $title, $content, $userId, $slug);
    $stmt->execute();
    $stmt->close();
    json_ok([]);
}

json_error('Ruta no encontrada', 404);
