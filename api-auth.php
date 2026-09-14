<?php
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
install_json_error_handlers();

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if ($action === 'me' && $method === 'GET') {
    $session = current_session();
    if (!$session) {
        json_ok(['authenticated' => false]);
    }
    json_ok([
        'authenticated' => true,
        'user' => [
            'id' => $session['user']['id'],
            'email' => $session['user']['email'],
            'name' => $session['user']['name'],
            'role' => $session['user']['role'],
        ],
    ]);
}

if ($action === 'login' && $method === 'POST') {
    $body = json_body();
    $email = str_field($body, 'email');
    $password = $body['password'] ?? '';

    if ($email === '' || $password === '') {
        json_error('Correo o contraseña incorrectos', 401);
    }

    $mysqli = db();
    $stmt = $mysqli->prepare('SELECT id, password_hash, is_active FROM users WHERE email = ?');
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    // Mismo mensaje genérico si el correo no existe o si la contraseña es
    // incorrecta — no revelar qué correos están registrados.
    if (!$row || !$row['is_active'] || !password_verify($password, $row['password_hash'])) {
        json_error('Correo o contraseña incorrectos', 401);
    }

    $session = create_session(
        $row['id'],
        $_SERVER['HTTP_USER_AGENT'] ?? null,
        $_SERVER['REMOTE_ADDR'] ?? null
    );

    $update = $mysqli->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?');
    $update->bind_param('s', $row['id']);
    $update->execute();
    $update->close();

    set_session_cookie($session['id'], $session['expiresAt']);
    json_ok([]);
}

if ($action === 'logout' && $method === 'POST') {
    $sessionId = $_COOKIE[SESSION_COOKIE_NAME] ?? null;
    if ($sessionId) {
        destroy_session($sessionId);
    }
    clear_session_cookie();
    json_ok([]);
}

json_error('Ruta no encontrada', 404);
