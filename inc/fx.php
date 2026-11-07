<?php
// Tipo de cambio USD → CLP compartido entre api-pricing.php (precios de paquetes) y api-quotations.php (cotizaciones).
// Funciones movidas tal cual desde api-pricing.php; no cambian de comportamiento.

const ROUND_STEPS = [1, 10, 100, 500, 1000, 5000, 10000];

/** Lee del banco la última cifra del «dólar observado» (la oficial del Banco Central de Chile, publicada por mindicador.cl). null si no responde. */
/** GET a una API pública que responde JSON. null si no responde. */
function http_json(string $url): ?array {
    $ctx = stream_context_create(['http' => ['timeout' => 6, 'header' => "User-Agent: TravelOnline-CRM\r\nAccept: application/json\r\n"], 'ssl' => ['verify_peer' => true]]);
    $raw = @file_get_contents($url, false, $ctx);
    $d = $raw === false ? null : json_decode($raw, true);
    return is_array($d) ? $d : null;
}

function fetch_observed(): ?array {
    $ctx = stream_context_create(['http' => ['timeout' => 6, 'header' => "User-Agent: TravelOnline-CRM\r\nAccept: application/json\r\n"], 'ssl' => ['verify_peer' => true]]);
    $raw = @file_get_contents('https://mindicador.cl/api/dolar', false, $ctx);
    if ($raw === false) return null;
    $d = json_decode($raw, true);
    $last = $d['serie'][0] ?? null;
    if (!$last || !isset($last['valor'], $last['fecha']) || !is_numeric($last['valor']) || (float) $last['valor'] < 100 || (float) $last['valor'] > 5000) return null;
    return ['value' => round((float) $last['valor'], 2), 'date' => substr($last['fecha'], 0, 10)];
}

function set_kv(mysqli $m, array $pairs): void {
    $s = $m->prepare('INSERT INTO crm_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)');
    foreach ($pairs as $k => $v) { $v = (string) $v; $s->bind_param('ss', $k, $v); $s->execute(); }
    $s->close();
}

function get_kv(mysqli $m, array $keys): array {
    $in = implode(',', array_map(fn($k) => "'" . $m->real_escape_string($k) . "'", $keys));
    $res = $m->query("SELECT k, v FROM crm_settings WHERE k IN ($in)");
    $kv = [];
    while ($r = $res->fetch_assoc()) $kv[$r['k']] = $r['v'];
    return $kv;
}

/** Dólar observado guardado; se refresca si tiene más de 6 horas (o con $force). Si el banco no responde, queda el último valor guardado. */
function observed_rate(mysqli $m, bool $force = false): array {
    $kv = get_kv($m, ['usd_observed_value', 'usd_observed_date', 'usd_observed_fetched', 'usd_observed_attempt']);
    $fetched = isset($kv['usd_observed_fetched']) ? (int) $kv['usd_observed_fetched'] : 0;
    $failed = false;
    $attempt = isset($kv['usd_observed_attempt']) ? (int) $kv['usd_observed_attempt'] : 0;
    $stale = !isset($kv['usd_observed_value']) || $kv['usd_observed_value'] === '' || time() - $fetched > 6 * 3600;
    // Si el banco no responde, no se reintenta en cada pantalla (cada intento puede tardar hasta 6 s): se espera 10 minutos.
    if ($force || ($stale && time() - $attempt > 600)) {
        set_kv($m, ['usd_observed_attempt' => time()]);
        $o = fetch_observed();
        if ($o) {
            set_kv($m, ['usd_observed_value' => $o['value'], 'usd_observed_date' => $o['date'], 'usd_observed_fetched' => time()]);
            $kv = ['usd_observed_value' => $o['value'], 'usd_observed_date' => $o['date'], 'usd_observed_fetched' => time()];
            $fetched = time();
        } else {
            $failed = true;
        }
    } elseif ($stale) {
        $failed = true; // desactualizado y en espera del próximo intento
    }
    $value = isset($kv['usd_observed_value']) && is_numeric($kv['usd_observed_value']) ? (float) $kv['usd_observed_value'] : null;
    return ['value' => $value, 'date' => $kv['usd_observed_date'] ?? null, 'fetchedAt' => $fetched ?: null, 'failed' => $failed, 'source' => 'Dólar observado, Banco Central de Chile (vía mindicador.cl)'];
}

function pricing_settings(mysqli $m): array {
    $kv = get_kv($m, ['usd_clp_rate', 'price_round_step', 'usd_clp_mode', 'usd_clp_adjust_pct']);
    $manual = isset($kv['usd_clp_rate']) && is_numeric($kv['usd_clp_rate']) && (float) $kv['usd_clp_rate'] > 0 ? (float) $kv['usd_clp_rate'] : null;
    $step = isset($kv['price_round_step']) && in_array((int) $kv['price_round_step'], ROUND_STEPS, true) ? (int) $kv['price_round_step'] : 1000;
    $mode = ($kv['usd_clp_mode'] ?? 'auto') === 'manual' ? 'manual' : 'auto';
    $adjust = isset($kv['usd_clp_adjust_pct']) && is_numeric($kv['usd_clp_adjust_pct']) ? (float) $kv['usd_clp_adjust_pct'] : 0.0;
    $obs = observed_rate($m);
    // Tipo de cambio que se usa para calcular: en automático, el dólar observado de hoy más el ajuste (colchón) que se elija.
    $rate = $mode === 'auto' ? ($obs['value'] ? round($obs['value'] * (1 + $adjust / 100), 2) : null) : $manual;
    return ['rate' => $rate, 'step' => $step, 'mode' => $mode, 'manualRate' => $manual, 'adjustPct' => $adjust, 'observed' => $obs];
}
