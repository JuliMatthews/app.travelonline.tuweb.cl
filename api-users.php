<?php
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
install_json_error_handlers();

$session = require_auth('users:manage');
$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'];
$mysqli = db();
$VALID_ROLES = ['super_admin', 'admin_viewer', 'editor'];

if ($action === 'list' && $method === 'GET') {
    $res = $mysqli->query('SELECT id, email, name, role, is_active, last_login_at FROM users ORDER BY name');
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $rows[] = [
            'id' => $r['id'], 'email' => $r['email'], 'name' => $r['name'],
            'role' => $r['role'], 'isActive' => (bool) $r['is_active'], 'lastLoginAt' => $r['last_login_at'],
        ];
    }
    json_ok(['users' => $rows]);
}

if ($action === 'get' && $method === 'GET') {
    $id = $_GET['id'] ?? '';
    $stmt = $mysqli->prepare('SELECT id, email, name, role, is_active, last_login_at FROM users WHERE id = ?');
    $stmt->bind_param('s', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) json_error('Usuario no encontrado', 404);
    json_ok(['user' => [
        'id' => $row['id'], 'email' => $row['email'], 'name' => $row['name'],
        'role' => $row['role'], 'isActive' => (bool) $row['is_active'], 'lastLoginAt' => $row['last_login_at'],
    ]]);
}

if ($action === 'create' && $method === 'POST') {
    $input = json_body();
    $email = str_field($input, 'email');
    $password = $input['password'] ?? '';
    $name = str_field($input, 'name');
    $role = $input['role'] ?? '';

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Correo inválido', 400);
    if (strlen($password) < 8) json_error('La contraseña debe tener al menos 8 caracteres', 400);
    if (!in_array($role, $VALID_ROLES, true)) json_error('Rol inválido', 400);

    $id = new_uuid();
    $hash = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $mysqli->prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)');
    $stmt->bind_param('sssss', $id, $email, $hash, $name, $role);
    if (!$stmt->execute()) {
        $stmt->close();
        if ($mysqli->errno === 1062) json_error('Ya existe una cuenta con ese correo', 409);
        json_error('No se pudo crear el usuario', 500);
    }
    $stmt->close();
    json_ok(['id' => $id]);
}

if ($action === 'update' && $method === 'POST') {
    $id = $_GET['id'] ?? '';
    $input = json_body();
    $name = str_field($input, 'name');
    $role = $input['role'] ?? '';
    $isActive = !empty($input['isActive']) ? 1 : 0;
    $newPassword = $input['newPassword'] ?? '';

    if (!in_array($role, $VALID_ROLES, true)) json_error('Rol inválido', 400);
    if ($id === $session['user']['id'] && !$isActive) {
        json_error('No puedes desactivar tu propia cuenta', 400);
    }

    if ($newPassword !== '') {
        if (strlen($newPassword) < 8) json_error('La contraseña debe tener al menos 8 caracteres', 400);
        $hash = password_hash($newPassword, PASSWORD_BCRYPT);
        $stmt = $mysqli->prepare('UPDATE users SET name=?, role=?, is_active=?, password_hash=? WHERE id=?');
        $stmt->bind_param('ssiss', $name, $role, $isActive, $hash, $id);
    } else {
        $stmt = $mysqli->prepare('UPDATE users SET name=?, role=?, is_active=? WHERE id=?');
        $stmt->bind_param('ssis', $name, $role, $isActive, $id);
    }
    $stmt->execute();
    $stmt->close();

    if (!$isActive) {
        $del = $mysqli->prepare('DELETE FROM sessions WHERE user_id = ?');
        $del->bind_param('s', $id);
        $del->execute();
        $del->close();
    }
    json_ok([]);
}

json_error('Ruta no encontrada', 404);
