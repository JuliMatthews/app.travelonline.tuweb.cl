<?php
// Conexión mysqli reutilizable — mismo patrón que hvac-manager-web
// (mysqli + prepared statements, nunca PDO, nunca concatenar SQL).
require_once __DIR__ . '/../config.php';

function db(): mysqli {
    static $mysqli = null;
    if ($mysqli !== null) {
        return $mysqli;
    }
    $mysqli = @new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
    if ($mysqli->connect_error) {
        error_log('[DB] connect_error: ' . $mysqli->connect_error);
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'Error de conexión a la base de datos']);
        exit;
    }
    $mysqli->set_charset('utf8mb4');
    return $mysqli;
}

// UUID v4 casero — MySQL 5.7 no genera UUID por defecto en columnas, así
// que se genera en PHP antes del INSERT (igual que hvac-manager con los
// nombres de archivo: bin2hex(random_bytes(...)) formateado).
function new_uuid(): string {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40); // versión 4
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80); // variante
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}
