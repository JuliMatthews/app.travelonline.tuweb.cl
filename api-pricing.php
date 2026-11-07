<?php
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
require_once __DIR__ . '/inc/fx.php';
install_json_error_handlers();

// Precios en dólares → pesos. El tipo de cambio y el redondeo viven en crm_settings; el margen, en cada proveedor
// (operators.markup_pct). Precio en CLP = USD × (1 + margen/100) × tipo de cambio, redondeado al múltiplo elegido.
// Ver y calcular lo puede cualquiera con acceso a paquetes; cambiar el tipo de cambio o aplicar el recálculo, solo 'settings:manage'.
$action = $_GET['action'] ?? 'settings';
// «observed» y «currencies» (el dólar y las monedas de hoy para el tablero) lo ve cualquier usuario del panel; lo demás, quien ve paquetes.
$session = require_auth(in_array($action, ['observed', 'currencies'], true) ? null : 'packages:view');
$user = $session['user'];
$method = $_SERVER['REQUEST_METHOD'];
$mysqli = db();






// Monedas de referencia por región, según los destinos del catálogo.
const CURRENCY_GROUPS = [
    'Base de los precios' => ['USD'],
    'Europa' => ['EUR', 'GBP', 'CHF', 'NOK', 'PLN'],
    'Asia' => ['CNY', 'JPY', 'HKD'],
    'Medio Oriente' => ['TRY', 'AED', 'EGP'],
    'África' => ['MAD', 'ZAR'],
    'América' => ['MXN', 'BRL', 'DOP', 'COP'],
];
const CURRENCY_NAMES = [
    'USD' => 'Dólar estadounidense', 'EUR' => 'Euro', 'GBP' => 'Libra esterlina', 'CHF' => 'Franco suizo', 'NOK' => 'Corona noruega', 'PLN' => 'Esloti polaco',
    'CNY' => 'Yuan chino', 'JPY' => 'Yen japonés', 'HKD' => 'Dólar de Hong Kong', 'TRY' => 'Lira turca', 'AED' => 'Dírham de los Emiratos', 'EGP' => 'Libra egipcia',
    'MAD' => 'Dírham marroquí', 'ZAR' => 'Rand sudafricano', 'MXN' => 'Peso mexicano', 'BRL' => 'Real brasileño', 'DOP' => 'Peso dominicano', 'COP' => 'Peso colombiano',
];

/** Pesos chilenos por 1 unidad de cada moneda. USD y EUR: oficiales (Banco Central). Las demás: cruzadas contra el dólar observado (referenciales). */
function refresh_currencies(mysqli $m): void {
    $obs = observed_rate($m);
    if (!$obs['value']) return;
    $er = http_json('https://open.er-api.com/v6/latest/USD');
    $rates = ($er && ($er['result'] ?? '') === 'success') ? ($er['rates'] ?? []) : [];
    $erDate = $er && !empty($er['time_last_update_unix']) ? gmdate('Y-m-d', (int) $er['time_last_update_unix']) : null;
    $mi = http_json('https://mindicador.cl/api');
    $out = ['USD' => [$obs['value'], $obs['date'], 1]];
    if ($mi && isset($mi['euro']['valor']) && is_numeric($mi['euro']['valor']) && $mi['euro']['valor'] > 100) $out['EUR'] = [(float) $mi['euro']['valor'], substr($mi['euro']['fecha'], 0, 10), 1];
    foreach (CURRENCY_GROUPS as $codes) foreach ($codes as $c) {
        if (isset($out[$c]) || empty($rates[$c]) || !is_numeric($rates[$c]) || (float) $rates[$c] <= 0) continue;
        $out[$c] = [round($obs['value'] / (float) $rates[$c], 4), $erDate, 0];
    }
    $s = $m->prepare('INSERT INTO fx_rates (code, clp, rate_date, official, fetched_at) VALUES (?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE clp = VALUES(clp), rate_date = VALUES(rate_date), official = VALUES(official), fetched_at = NOW()');
    foreach ($out as $code => [$clp, $date, $off]) { $s->bind_param('sdsi', $code, $clp, $date, $off); $s->execute(); }
    $s->close();
}



function calc_clp(float $usd, float $markupPct, float $rate, int $step): int {
    return (int) (round($usd * (1 + $markupPct / 100) * $rate / $step) * $step);
}

function priced_rows(mysqli $m, array $set): array {
    $res = $m->query(
        "SELECT p.id, p.title, p.status, p.price_usd, p.price_from_clp, p.price_display_mode, COALESCE(o.markup_pct, 0) AS markup, o.name AS operator_name
         FROM packages p LEFT JOIN operators o ON o.id = p.operator_id
         WHERE p.price_usd IS NOT NULL ORDER BY p.title"
    );
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $clp = $set['rate'] ? calc_clp((float) $r['price_usd'], (float) $r['markup'], $set['rate'], $set['step']) : null;
        $rows[] = [
            'id' => $r['id'], 'title' => $r['title'], 'status' => $r['status'], 'operator' => $r['operator_name'],
            'priceUsd' => (float) $r['price_usd'], 'markupPct' => (float) $r['markup'],
            'currentClp' => $r['price_from_clp'] !== null ? (int) $r['price_from_clp'] : null,
            'newClp' => $clp,
            'changes' => $clp !== null && ($r['price_display_mode'] !== 'desde' || (int) $r['price_from_clp'] !== $clp),
        ];
    }
    return $rows;
}

if ($action === 'settings' && $method === 'GET') {
    $set = pricing_settings($mysqli);
    $rows = priced_rows($mysqli, $set);
    json_ok([
        'rate' => $set['rate'], 'step' => $set['step'], 'steps' => ROUND_STEPS,
        'mode' => $set['mode'], 'manualRate' => $set['manualRate'], 'adjustPct' => $set['adjustPct'], 'observed' => $set['observed'],
        'canManage' => can($user, 'settings:manage'),
        'withUsd' => count($rows), 'toUpdate' => count(array_filter($rows, fn($r) => $r['changes'])),
    ]);
}

if ($action === 'settings' && $method === 'POST') {
    require_auth('settings:manage');
    $in = json_body();
    $mode = ($in['mode'] ?? 'auto') === 'manual' ? 'manual' : 'auto';
    $rate = $in['rate'] ?? null;
    $adjust = $in['adjustPct'] ?? 0;
    $step = (int) ($in['step'] ?? 1000);
    if ($rate !== null && $rate !== '' && (!is_numeric($rate) || (float) $rate <= 0 || (float) $rate > 5000)) json_error('El tipo de cambio manual debe ser un número entre 1 y 5000 (pesos por dólar).');
    if ($mode === 'manual' && ($rate === null || $rate === '')) json_error('En modo manual hay que escribir el tipo de cambio.');
    if (!is_numeric($adjust) || (float) $adjust < -20 || (float) $adjust > 20) json_error('El ajuste sobre el dólar debe estar entre -20 y 20 por ciento.');
    if (!in_array($step, ROUND_STEPS, true)) json_error('Redondeo no válido.');
    set_kv($mysqli, [
        'usd_clp_mode' => $mode,
        'usd_clp_rate' => ($rate === null || $rate === '') ? '' : round((float) $rate, 2),
        'usd_clp_adjust_pct' => round((float) $adjust, 2),
        'price_round_step' => $step,
    ]);
    json_ok([]);
}

// Dólar de hoy para el tablero y los paneles. ?refresh=1 vuelve a consultar al banco.
if ($action === 'observed' && $method === 'GET') {
    $obs = observed_rate($mysqli, ($_GET['refresh'] ?? '') === '1' && can($user, 'settings:manage'));
    $set = pricing_settings($mysqli);
    json_ok(['observed' => $obs, 'mode' => $set['mode'], 'rate' => $set['rate'], 'adjustPct' => $set['adjustPct']]);
}

// Monedas del tablero, agrupadas por región. Se refresca sola si lo guardado tiene más de 6 horas.
if ($action === 'currencies' && $method === 'GET') {
    $age = $mysqli->query('SELECT MIN(fetched_at) AS oldest, COUNT(*) AS n FROM fx_rates')->fetch_assoc();
    $lastAttempt = (int) (get_kv($mysqli, ['fx_last_attempt'])['fx_last_attempt'] ?? 0);
    if (((int) $age['n'] === 0 || strtotime((string) $age['oldest']) < time() - 6 * 3600) && time() - $lastAttempt > 600) {
        set_kv($mysqli, ['fx_last_attempt' => time()]);
        refresh_currencies($mysqli);
    }
    $age = $mysqli->query('SELECT MIN(fetched_at) AS oldest, MAX(fetched_at) AS newest, COUNT(*) AS n FROM fx_rates')->fetch_assoc();
    $have = [];
    $res = $mysqli->query('SELECT code, clp, rate_date, official, fetched_at FROM fx_rates');
    while ($r = $res->fetch_assoc()) $have[$r['code']] = $r;
    $groups = [];
    foreach (CURRENCY_GROUPS as $label => $codes) {
        $items = [];
        foreach ($codes as $c) if (isset($have[$c])) $items[] = ['code' => $c, 'name' => CURRENCY_NAMES[$c] ?? $c, 'clp' => (float) $have[$c]['clp'], 'date' => $have[$c]['rate_date'], 'official' => (bool) $have[$c]['official']];
        if ($items) $groups[] = ['label' => $label, 'items' => $items];
    }
    json_ok(['groups' => $groups, 'updatedAt' => $age['newest'] ?? null, 'oldestAt' => $age['oldest'] ?? null]);
}

// Vista previa (sin escribir) o aplicar: precio en CLP de todos los programas que tienen precio en USD.
if ($action === 'recalc' && $method === 'POST') {
    require_auth('settings:manage');
    $in = json_body();
    $set = pricing_settings($mysqli);
    if (!$set['rate']) json_error('Primero define el tipo de cambio.');
    $rows = priced_rows($mysqli, $set);
    $changed = array_values(array_filter($rows, fn($r) => $r['changes']));
    $applied = 0;
    if (!empty($in['apply'])) {
        $u = $mysqli->prepare("UPDATE packages SET price_from_clp = ?, price_display_mode = 'desde', updated_by = ? WHERE id = ?");
        foreach ($changed as $r) { $u->bind_param('iss', $r['newClp'], $user['id'], $r['id']); $u->execute(); $applied += $u->affected_rows > 0 ? 1 : 0; }
        $u->close();
    }
    json_ok(['rows' => $rows, 'toUpdate' => count($changed), 'applied' => $applied, 'rate' => $set['rate'], 'step' => $set['step']]);
}

json_error('Ruta no encontrada', 404);
