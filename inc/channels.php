<?php
// Salud de los canales de entrada: cuándo llegó la última solicitud por cada canal y si lleva
// demasiado en silencio. El límite de días es editable por canal (crm_settings: channel_alert_<canal>);
// 0 = sin alerta. Solo mide lo que ya llegó al CRM (no lee casillas de correo todavía).
require_once __DIR__ . '/db.php';

const CHANNEL_KEYS = ['web', 'asistente', 'whatsapp', 'telefono', 'correo', 'instagram', 'referido', 'otro'];
// Valores iniciales (editables). Los canales de baja frecuencia parten sin alerta.
const CHANNEL_DEFAULT_ALERT_DAYS = ['web' => 7, 'asistente' => 7, 'whatsapp' => 7, 'telefono' => 7, 'correo' => 7];

function channel_thresholds(mysqli $m): array {
    $t = [];
    foreach (CHANNEL_KEYS as $c) $t[$c] = CHANNEL_DEFAULT_ALERT_DAYS[$c] ?? 0;
    $res = $m->query("SELECT k, v FROM crm_settings WHERE k LIKE 'channel_alert_%'");
    while ($r = $res->fetch_assoc()) {
        $c = substr($r['k'], strlen('channel_alert_'));
        if (isset($t[$c])) $t[$c] = max(0, (int) $r['v']);
    }
    return $t;
}

function channel_health(mysqli $m): array {
    $thr = channel_thresholds($m);
    $res = $m->query("SELECT channel, COUNT(*) AS total, MAX(created_at) AS last_at,
        SUM(created_at >= NOW() - INTERVAL 7 DAY) AS d7, SUM(created_at >= NOW() - INTERVAL 30 DAY) AS d30,
        SUM(created_at < NOW() - INTERVAL 7 DAY AND created_at >= NOW() - INTERVAL 14 DAY) AS prev7,
        TIMESTAMPDIFF(DAY, MAX(created_at), NOW()) AS silent_days FROM quote_requests GROUP BY channel");
    $by = [];
    while ($r = $res->fetch_assoc()) $by[$r['channel']] = $r;
    // Solicitudes por semana, últimas 8 semanas (0 = esta semana).
    $weeks = [];
    $res = $m->query("SELECT channel, FLOOR(TIMESTAMPDIFF(DAY, created_at, NOW()) / 7) AS w, COUNT(*) AS n FROM quote_requests
        WHERE created_at >= NOW() - INTERVAL 56 DAY GROUP BY channel, w");
    while ($r = $res->fetch_assoc()) $weeks[$r['channel']][(int) $r['w']] = (int) $r['n'];

    $out = [];
    foreach (CHANNEL_KEYS as $c) {
        $r = $by[$c] ?? null;
        $series = [];
        for ($w = 7; $w >= 0; $w--) $series[] = $weeks[$c][$w] ?? 0;
        $silent = $r ? (int) $r['silent_days'] : null;
        $limit = $thr[$c];
        $out[] = [
            'channel' => $c, 'total' => $r ? (int) $r['total'] : 0, 'lastAt' => $r['last_at'] ?? null,
            'last7' => $r ? (int) $r['d7'] : 0, 'last30' => $r ? (int) $r['d30'] : 0, 'prev7' => $r ? (int) $r['prev7'] : 0,
            'silentDays' => $silent, 'alertDays' => $limit, 'series' => $series,
            // Alerta: tiene límite y (nunca recibió algo, o lleva más días de silencio que el límite).
            'silent' => $limit > 0 && ($silent === null || $silent >= $limit),
            'neverReceived' => $r === null,
        ];
    }
    return $out;
}
