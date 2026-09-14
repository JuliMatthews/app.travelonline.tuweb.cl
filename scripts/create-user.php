<?php
// Bootstrap de cuentas — no hay auto-registro público (login cerrado por
// allowlist). Sirve para crear la primera cuenta super_admin o resetear una
// contraseña desde línea de comandos.
// Uso: php scripts/create-user.php <email> <password> "<nombre>" <super_admin|admin_viewer|editor>
require_once __DIR__ . '/../inc/db.php';

[, $email, $password, $name, $role] = $argv + [null, null, null, null, null];

$validRoles = ['super_admin', 'admin_viewer', 'editor'];
if (!$email || !$password || !$name || !in_array($role, $validRoles, true)) {
    fwrite(STDERR, "Uso: php scripts/create-user.php <email> <password> \"<nombre>\" <" . implode('|', $validRoles) . ">\n");
    exit(1);
}

$mysqli = db();
$passwordHash = password_hash($password, PASSWORD_BCRYPT);

$existing = $mysqli->prepare('SELECT id FROM users WHERE email = ?');
$existing->bind_param('s', $email);
$existing->execute();
$row = $existing->get_result()->fetch_assoc();
$existing->close();

if ($row) {
    $stmt = $mysqli->prepare('UPDATE users SET password_hash = ?, name = ?, role = ?, is_active = 1 WHERE id = ?');
    $stmt->bind_param('ssss', $passwordHash, $name, $role, $row['id']);
    $stmt->execute();
    $stmt->close();
    echo "Usuario actualizado: $email ($role)\n";
} else {
    $id = new_uuid();
    $stmt = $mysqli->prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)');
    $stmt->bind_param('sssss', $id, $email, $passwordHash, $name, $role);
    $stmt->execute();
    $stmt->close();
    echo "Usuario creado: $email ($role) id=$id\n";
}
