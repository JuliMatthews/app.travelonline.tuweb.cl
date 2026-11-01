<?php
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
require_once __DIR__ . '/inc/channels.php';
install_json_error_handlers();

$session = require_auth('quotes:view');
$action = $_GET['action'] ?? 'list';
$mysqli = db();

if ($action === 'list' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    json_ok(['channels' => channel_health($mysqli), 'canEdit' => can($session['user'], 'settings:manage')]);
}

if ($action === 'save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    require_auth('settings:manage');
    $in = json_body()['alertDays'] ?? null;
    if (!is_array($in)) json_error('Datos inválidos', 400);
    $s = $mysqli->prepare('INSERT INTO crm_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)');
    foreach ($in as $channel => $days) {
        if (!in_array($channel, CHANNEL_KEYS, true)) continue;
        $d = max(0, min(365, (int) $days));
        $k = 'channel_alert_' . $channel;
        $v = (string) $d;
        $s->bind_param('ss', $k, $v);
        $s->execute();
    }
    json_ok(['channels' => channel_health($mysqli)]);
}

json_error('Ruta no encontrada', 404);
