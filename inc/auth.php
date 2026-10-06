<?php
// Auth del panel — tabla `sessions` propia (token opaco = la cookie), NO
// $_SESSION nativo de PHP, para poder tener roles reales y revocar una
// sesión al instante (borrar la fila, o is_active=0 en users) igual que ya
// se probó en el stack Node. Password con password_hash()/password_verify()
// (bcrypt — mismo formato $2y$ que bcryptjs, compatible).
require_once __DIR__ . '/db.php';

const ROLE_PERMISSIONS = [
    'super_admin' => [
        'quotes:view', 'quotes:edit',
        'clients:view', 'clients:edit',
        'packages:view', 'packages:create', 'packages:edit', 'packages:delete',
        'pages:view', 'pages:edit',
        'blog:view', 'blog:create', 'blog:edit', 'blog:delete',
        'users:manage', 'settings:manage',
    ],
    'admin_viewer' => ['quotes:view', 'clients:view', 'packages:view', 'pages:view', 'blog:view'],
    'editor' => ['quotes:view', 'quotes:edit', 'clients:view', 'clients:edit', 'packages:view', 'packages:edit', 'pages:view', 'blog:view'],
];

function can(?array $user, string $action): bool {
    if ($user === null) return false;
    return in_array($action, ROLE_PERMISSIONS[$user['role']] ?? [], true);
}

function create_session(string $userId, ?string $userAgent, ?string $ip): array {
    $mysqli = db();
    $id = new_uuid();
    $expiresAt = date('Y-m-d H:i:s', time() + SESSION_DAYS * 86400);
    $stmt = $mysqli->prepare(
        'INSERT INTO sessions (id, user_id, expires_at, user_agent, ip_address) VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->bind_param('sssss', $id, $userId, $expiresAt, $userAgent, $ip);
    $stmt->execute();
    $stmt->close();
    return ['id' => $id, 'expiresAt' => $expiresAt];
}

function destroy_session(string $sessionId): void {
    $mysqli = db();
    $stmt = $mysqli->prepare('DELETE FROM sessions WHERE id = ?');
    $stmt->bind_param('s', $sessionId);
    $stmt->execute();
    $stmt->close();
}

const UUID_RE = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

// Gate autoritativo — SIEMPRE consulta la base (sesión + usuario activo),
// nunca confía solo en que la cookie exista. Cacheado en un static por
// request (equivalente a cache() de React en el stack anterior).
function current_session(): ?array {
    static $cached = false;
    static $result = null;
    if ($cached) return $result;
    $cached = true;

    $sessionId = $_COOKIE[SESSION_COOKIE_NAME] ?? null;
    if (!$sessionId || !preg_match(UUID_RE, $sessionId)) {
        return $result;
    }

    $mysqli = db();
    $stmt = $mysqli->prepare(
        'SELECT u.id, u.email, u.name, u.role, u.is_active
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.expires_at > NOW() AND u.is_active = 1'
    );
    $stmt->bind_param('s', $sessionId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($row) {
        $result = ['sessionId' => $sessionId, 'user' => $row];
    }
    return $result;
}

function require_auth(?string $action = null): array {
    $session = current_session();
    if (!$session || ($action !== null && !can($session['user'], $action))) {
        json_error('No autorizado', 403);
    }
    return $session;
}

function set_session_cookie(string $sessionId, string $expiresAt): void {
    setcookie(SESSION_COOKIE_NAME, $sessionId, [
        'expires' => strtotime($expiresAt),
        'path' => '/',
        'httponly' => true,
        'secure' => !empty($_SERVER['HTTPS']),
        'samesite' => 'Lax',
    ]);
}

function clear_session_cookie(): void {
    setcookie(SESSION_COOKIE_NAME, '', [
        'expires' => time() - 3600,
        'path' => '/',
        'httponly' => true,
    ]);
}
