<?php
// Cotizaciones versionadas. Una solicitud → una cotización (N° 1001…) → versiones (1001.1, 1001.2…).
// Borrador = editable; enviada = congelada (un cambio crea una versión nueva).
// Los totales SIEMPRE se recalculan acá; nunca se confía en el total que manda el navegador.
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
require_once __DIR__ . '/inc/quote_email.php';
require_once __DIR__ . '/inc/fx.php';
install_json_error_handlers();

$session = require_auth('quotes:view');
$action = $_GET['action'] ?? 'get';
$method = $_SERVER['REQUEST_METHOD'];
$mysqli = db();
$userId = $session['user']['id'];

const DEFAULT_INCLUDES = "Asesoría personalizada antes y durante el viaje";
const DEFAULT_EXCLUDES = "Excursiones opcionales no detalladas\nGastos personales y propinas\nVisa o trámites migratorios\nServicios no mencionados en el detalle";
const VALID_DAYS = 7;

function version_label(int $number, int $version): string {
    return $version <= 1 ? (string) $number : "$number." . ($version - 1);
}

function version_row_to_json(array $r, int $number): array {
    return [
        'id' => (int) $r['id'], 'version' => (int) $r['version'], 'label' => version_label($number, (int) $r['version']),
        'status' => $r['status'], 'title' => $r['title'], 'subtitle' => $r['subtitle'], 'pax' => (int) $r['pax'],
        'lines' => json_decode($r['lines_json'], true) ?: [],
        'discountClp' => (int) $r['discount_clp'], 'discountLabel' => $r['discount_label'], 'totalClp' => (int) $r['total_clp'],
        'includesText' => $r['includes_text'], 'excludesText' => $r['excludes_text'], 'validUntil' => $r['valid_until'],
        'flightsText' => $r['flights_text'] ?? null, 'itinerary' => json_decode($r['itinerary_json'] ?? '[]', true) ?: [],
        'flights' => json_decode($r['flights_json'] ?? '[]', true) ?: [],
        'fxUsdClp' => isset($r['fx_usd_clp']) && $r['fx_usd_clp'] !== null ? (float) $r['fx_usd_clp'] : null, 'fxDate' => $r['fx_date'] ?? null,
        'fxManualRate' => !empty($r['fx_manual']) && isset($r['fx_usd_clp']) ? (float) $r['fx_usd_clp'] : null,
        'itineraryPackageId' => $r['itinerary_package_id'] ?? null, 'itineraryPackageTitle' => $r['itinerary_package_title'] ?? null,
        'promisedAt' => $r['promised_at'],
        'changeReason' => $r['change_reason'], 'createdAt' => $r['created_at'], 'updatedAt' => $r['updated_at'], 'sentAt' => $r['sent_at'],
        'createdByName' => $r['created_by_name'] ?? null,
    ];
}

const VERSION_SELECT = 'SELECT v.*, u.name AS created_by_name, sp.title AS itinerary_package_title FROM quotation_versions v LEFT JOIN users u ON u.id = v.created_by LEFT JOIN packages sp ON sp.id = v.itinerary_package_id';

function load_quotation(mysqli $m, int $requestId): ?array {
    $s = $m->prepare('SELECT q.id, q.request_id, q.number, p.id AS package_id, p.status AS package_status
        FROM quotations q LEFT JOIN packages p ON p.id = q.package_id WHERE q.request_id = ?');
    $s->bind_param('i', $requestId);
    $s->execute();
    $q = $s->get_result()->fetch_assoc();
    $s->close();
    if (!$q) return null;
    $s = $m->prepare(VERSION_SELECT . ' WHERE v.quotation_id = ? ORDER BY v.version DESC');
    $s->bind_param('i', $q['id']);
    $s->execute();
    $res = $s->get_result();
    $versions = [];
    while ($r = $res->fetch_assoc()) $versions[] = version_row_to_json($r, (int) $q['number']);
    $s->close();
    return ['id' => (int) $q['id'], 'requestId' => (int) $q['request_id'], 'number' => (int) $q['number'], 'versions' => $versions,
        'packageId' => $q['package_id'], 'packageStatus' => $q['package_status']];
}

// Limpia y valida las líneas; devuelve [líneas, total, usaDolares]. Una línea con amountUsd se calcula en pesos con el
// tipo de cambio del sistema (el mismo de los precios de paquetes: dólar observado + ajuste, o el manual) y su redondeo.
function clean_lines($raw, $discount, ?array $fx = null): array {
    if (!is_array($raw)) json_error('Líneas inválidas', 400);
    $lines = [];
    $subtotal = 0;
    $usesUsd = false;
    foreach (array_slice($raw, 0, 40) as $l) {
        if (!is_array($l)) continue;
        $title = trim((string) ($l['title'] ?? ''));
        if ($title === '') continue;
        $usd = max(0, round((float) ($l['amountUsd'] ?? 0), 2));
        $row = ['title' => mb_substr($title, 0, 190), 'detail' => mb_substr(trim((string) ($l['detail'] ?? '')), 0, 500)];
        if ($usd > 0) {
            if (!$fx || !$fx['rate']) json_error('No hay tipo de cambio disponible para calcular los montos en dólares. Escribe el monto en pesos o avisa a Julio.', 409);
            $step = max(1, (int) $fx['step']);
            $amount = (int) (round($usd * $fx['rate'] / $step) * $step);
            $row['amountUsd'] = $usd;
            $usesUsd = true;
        } else {
            $amount = max(0, (int) round((float) ($l['amountClp'] ?? 0)));
        }
        $row['amountClp'] = $amount;
        $lines[] = $row;
        $subtotal += $amount;
    }
    if (!$lines) json_error('Agrega al menos una línea con descripción', 400);
    $disc = max(0, (int) round((float) $discount));
    if ($disc > $subtotal) json_error('El descuento no puede superar el subtotal', 400);
    return [$lines, $subtotal - $disc, $usesUsd];
}

// Vuelos pegados desde el portal: se guardan como datos (no como imagen) para poder mostrarlos ordenados en el PDF.
function clean_flights($raw): array {
    if (!is_array($raw)) return [];
    $str = fn($v, int $n) => mb_substr(trim((string) $v), 0, $n);
    $date = fn($v) => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $v) ? (string) $v : '';
    $time = fn($v) => preg_match('/^\d{1,2}:\d{2}$/', (string) $v) ? (string) $v : '';
    $out = [];
    foreach (array_slice($raw, 0, 20) as $f) {
        if (!is_array($f)) continue;
        $b = is_array($f['baggage'] ?? null) ? $f['baggage'] : [];
        $row = [
            'airline' => $str($f['airline'] ?? '', 60), 'flightNo' => $str($f['flightNo'] ?? '', 12),
            'fromCity' => $str($f['fromCity'] ?? '', 80), 'fromCode' => strtoupper($str($f['fromCode'] ?? '', 3)),
            'departDate' => $date($f['departDate'] ?? ''), 'departTime' => $time($f['departTime'] ?? ''),
            'toCity' => $str($f['toCity'] ?? '', 80), 'toCode' => strtoupper($str($f['toCode'] ?? '', 3)),
            'arriveDate' => $date($f['arriveDate'] ?? ''), 'arriveTime' => $time($f['arriveTime'] ?? ''),
            'duration' => $str($f['duration'] ?? '', 20), 'stops' => $str($f['stops'] ?? '', 10), 'cabin' => $str($f['cabin'] ?? '', 60),
            'baggage' => ['hand' => !empty($b['hand']), 'cabin' => !empty($b['cabin']), 'hold' => !empty($b['hold'])],
            'holdKg' => $str($f['holdKg'] ?? '', 20),
        ];
        if ($row['fromCode'] === '' && $row['toCode'] === '' && $row['flightNo'] === '') continue;
        $out[] = $row;
    }
    return $out;
}

function clean_itinerary($raw): array {
    if (!is_array($raw)) return [];
    $days = [];
    foreach (array_slice($raw, 0, 60) as $d) {
        if (!is_array($d)) continue;
        $title = mb_substr(trim((string) ($d['title'] ?? '')), 0, 190);
        $detail = mb_substr(trim((string) ($d['detail'] ?? '')), 0, 20000);
        if ($title === '' && $detail === '') continue;
        $days[] = ['title' => $title, 'detail' => $detail];
    }
    return $days;
}

function save_fields(mysqli $m, int $versionId, array $in): void {
    $fxSet = null;
    foreach (is_array($in['lines'] ?? null) ? $in['lines'] : [] as $l) { if (is_array($l) && (float) ($l['amountUsd'] ?? 0) > 0) { $fxSet = pricing_settings($m); break; } }
    $manualIn = round((float) ($in['fxManualRate'] ?? 0), 2);
    if ($manualIn > 0 && ($manualIn < 100 || $manualIn > 5000)) json_error('El dólar que escribiste no parece válido (debe estar entre $100 y $5.000).', 400);
    if ($fxSet && $manualIn > 0) $fxSet['rate'] = $manualIn;
    [$lines, $total, $usesUsd] = clean_lines($in['lines'] ?? null, $in['discountClp'] ?? 0, $fxSet);
    // Dólar propio de quien cotiza (opcional): reemplaza al automático solo en esta cotización.
    $manual = round((float) ($in['fxManualRate'] ?? 0), 2);
    if ($manual > 0 && ($manual < 100 || $manual > 5000)) json_error('El dólar que escribiste no parece válido (debe estar entre $100 y $5.000).', 400);
    $useManual = $usesUsd && $manual > 0;
    $fxRate = $usesUsd ? ($useManual ? $manual : $fxSet['rate']) : null;
    $fxDate = $usesUsd ? ($useManual ? date('Y-m-d') : ($fxSet['observed']['date'] ?: date('Y-m-d'))) : null;
    $fxManual = $useManual ? 1 : 0;
    $flightRows = clean_flights($in['flights'] ?? []);
    $flightsJson = $flightRows ? json_encode($flightRows, JSON_UNESCAPED_UNICODE) : null;
    $title = mb_substr(trim((string) ($in['title'] ?? '')), 0, 255);
    $subtitle = mb_substr(trim((string) ($in['subtitle'] ?? '')), 0, 255) ?: null;
    $pax = max(1, (int) ($in['pax'] ?? 1));
    $json = json_encode($lines, JSON_UNESCAPED_UNICODE);
    $disc = max(0, (int) ($in['discountClp'] ?? 0));
    $discLabel = mb_substr(trim((string) ($in['discountLabel'] ?? '')), 0, 190) ?: null;
    $inc = mb_substr(trim((string) ($in['includesText'] ?? '')), 0, 4000) ?: null;
    $exc = mb_substr(trim((string) ($in['excludesText'] ?? '')), 0, 4000) ?: null;
    $valid = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($in['validUntil'] ?? '')) ? $in['validUntil'] : null;
    $reason = mb_substr(trim((string) ($in['changeReason'] ?? '')), 0, 500) ?: null;
    $promised = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($in['promisedAt'] ?? '')) ? $in['promisedAt'] : null;
    $flights = mb_substr(trim((string) ($in['flightsText'] ?? '')), 0, 4000) ?: null;
    $days = clean_itinerary($in['itinerary'] ?? []);
    $itinJson = $days ? json_encode($days, JSON_UNESCAPED_UNICODE) : null;
    // Paquete del catálogo del que se cargó el itinerario (trazabilidad). Solo se conserva si hay días y el paquete existe.
    $srcPkg = null;
    $rawSrc = (string) ($in['itineraryPackageId'] ?? '');
    if ($days && preg_match('/^[0-9a-f-]{36}$/i', $rawSrc)) {
        $c = $m->prepare('SELECT 1 FROM packages WHERE id = ?');
        $c->bind_param('s', $rawSrc);
        $c->execute();
        if ($c->get_result()->num_rows > 0) $srcPkg = $rawSrc;
        $c->close();
    }
    $s = $m->prepare('UPDATE quotation_versions SET title=?, subtitle=?, pax=?, lines_json=?, discount_clp=?, discount_label=?, total_clp=?,
        includes_text=?, excludes_text=?, flights_text=?, flights_json=?, itinerary_json=?, itinerary_package_id=?, fx_usd_clp=?, fx_date=?, fx_manual=?, valid_until=?, change_reason=?, promised_at=? WHERE id=?');
    $s->bind_param('ssisisissssssssisssi', $title, $subtitle, $pax, $json, $disc, $discLabel, $total, $inc, $exc, $flights, $flightsJson, $itinJson, $srcPkg, $fxRate, $fxDate, $fxManual, $valid, $reason, $promised, $versionId);
    $s->execute();
    $s->close();
}

function log_quote_activity(mysqli $m, int $requestId, string $userId, string $kind, string $body, ?int $versionId = null): void {
    $s = $m->prepare('INSERT INTO quote_activity (quote_id, author_id, kind, body, quotation_version_id) VALUES (?, ?, ?, ?, ?)');
    $s->bind_param('isssi', $requestId, $userId, $kind, $body, $versionId);
    $s->execute();
    $s->close();
}

function find_version(mysqli $m, int $versionId): array {
    $s = $m->prepare('SELECT v.*, q.request_id, q.number FROM quotation_versions v JOIN quotations q ON q.id = v.quotation_id WHERE v.id = ?');
    $s->bind_param('i', $versionId);
    $s->execute();
    $v = $s->get_result()->fetch_assoc();
    $s->close();
    if (!$v) json_error('Versión no encontrada', 404);
    return $v;
}

if ($action === 'get' && $method === 'GET') {
    $requestId = (int) ($_GET['requestId'] ?? 0);
    json_ok(['quotation' => load_quotation($mysqli, $requestId)]);
}

// Datos para imprimir/guardar como PDF una versión (marca, cliente y cotización).
if ($action === 'print' && $method === 'GET') {
    $v = find_version($mysqli, (int) ($_GET['versionId'] ?? 0));
    $s = $mysqli->prepare('SELECT folio, brand, passenger_name, passenger_email, passenger_phone FROM quote_requests WHERE id = ?');
    $s->bind_param('i', $v['request_id']);
    $s->execute();
    $req = $s->get_result()->fetch_assoc();
    $s->close();
    json_ok([
        'version' => version_row_to_json($v, (int) $v['number']) + ['number' => (int) $v['number']],
        'reviewTo' => defined('MAIL_REVIEW_TO') ? MAIL_REVIEW_TO : null,
        'request' => ['folio' => $req['folio'], 'brand' => $req['brand'], 'passengerName' => $req['passenger_name'],
            'passengerEmail' => $req['passenger_email'], 'passengerPhone' => $req['passenger_phone']],
    ]);
}

// Todo lo de abajo escribe.
require_auth('quotes:edit');

if ($action === 'create' && $method === 'POST') {
    $requestId = (int) ($_GET['requestId'] ?? 0);
    $s = $mysqli->prepare('SELECT adults, children, package_title, destination_text, total_clp, budget_clp, travel_type FROM quote_requests WHERE id = ?');
    $s->bind_param('i', $requestId);
    $s->execute();
    $req = $s->get_result()->fetch_assoc();
    $s->close();
    if (!$req) json_error('Solicitud no encontrada', 404);
    if (load_quotation($mysqli, $requestId)) json_error('Esta solicitud ya tiene cotización', 409);

    $mysqli->begin_transaction();
    $number = (int) $mysqli->query('SELECT COALESCE(MAX(number), 1000) + 1 AS n FROM quotations')->fetch_assoc()['n'];
    $s = $mysqli->prepare('INSERT INTO quotations (request_id, number, created_by) VALUES (?, ?, ?)');
    $s->bind_param('iis', $requestId, $number, $userId);
    $s->execute();
    $qid = $mysqli->insert_id;
    $s->close();

    $dest = $req['destination_text'] ?: $req['package_title'] ?: 'Viaje';
    $pax = max(1, (int) $req['adults'] + (int) $req['children']);
    $first = $req['total_clp'] !== null ? (int) $req['total_clp'] : 0;
    $lines = json_encode([['title' => $req['package_title'] ?: "Programa $dest", 'detail' => "$pax pasajero" . ($pax === 1 ? '' : 's'), 'amountClp' => $first]], JSON_UNESCAPED_UNICODE);
    $title = $dest . ($req['travel_type'] ? ' · ' . $req['travel_type'] : '');
    $valid = date('Y-m-d', strtotime('+' . VALID_DAYS . ' days'));
    $s = $mysqli->prepare("INSERT INTO quotation_versions (quotation_id, version, title, pax, lines_json, total_clp, includes_text, excludes_text, valid_until, created_by)
        VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)");
    $inc = DEFAULT_INCLUDES; $exc = DEFAULT_EXCLUDES;
    $s->bind_param('isisissss', $qid, $title, $pax, $lines, $first, $inc, $exc, $valid, $userId);
    $s->execute();
    $firstVersionId = $mysqli->insert_id;
    $s->close();
    log_quote_activity($mysqli, $requestId, $userId, 'sistema', "Cotización N° $number creada (borrador)", $firstVersionId);
    $mysqli->commit();
    json_ok(['quotation' => load_quotation($mysqli, $requestId)]);
}

if ($action === 'save' && $method === 'POST') {
    $v = find_version($mysqli, (int) ($_GET['versionId'] ?? 0));
    if ($v['status'] !== 'borrador') json_error('La versión ya fue enviada y no se puede editar; crea una versión nueva', 409);
    save_fields($mysqli, (int) $v['id'], json_body());
    json_ok(['quotation' => load_quotation($mysqli, (int) $v['request_id'])]);
}

// Crea la versión siguiente copiando la última (que debe estar enviada).
if ($action === 'new_version' && $method === 'POST') {
    $requestId = (int) ($_GET['requestId'] ?? 0);
    $quotation = load_quotation($mysqli, $requestId);
    if (!$quotation) json_error('Esta solicitud aún no tiene cotización', 404);
    $last = $quotation['versions'][0];
    if ($last['status'] === 'borrador') json_error('Ya hay una versión en borrador; termínala antes de crear otra', 409);
    $reason = mb_substr(trim((string) (json_body()['changeReason'] ?? '')), 0, 500) ?: null;
    $next = $last['version'] + 1;
    $valid = date('Y-m-d', strtotime('+' . VALID_DAYS . ' days'));
    $json = json_encode($last['lines'], JSON_UNESCAPED_UNICODE);
    $s = $mysqli->prepare("INSERT INTO quotation_versions (quotation_id, version, title, subtitle, pax, lines_json, discount_clp, discount_label, total_clp,
        includes_text, excludes_text, flights_text, flights_json, itinerary_json, itinerary_package_id, fx_usd_clp, fx_date, fx_manual, valid_until, promised_at, change_reason, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    $itinCopy = $last['itinerary'] ? json_encode($last['itinerary'], JSON_UNESCAPED_UNICODE) : null;
    $flightsCopy = $last['flights'] ? json_encode($last['flights'], JSON_UNESCAPED_UNICODE) : null;
    $fxManualCopy = $last['fxManualRate'] !== null ? 1 : 0; // bind_param exige variables, no expresiones
    $promised = date('Y-m-d', strtotime('+1 day')); // regla: el cambio pedido por el cliente sale al día siguiente
    $s->bind_param('iissisisissssssssissss', $quotation['id'], $next, $last['title'], $last['subtitle'], $last['pax'], $json, $last['discountClp'],
        $last['discountLabel'], $last['totalClp'], $last['includesText'], $last['excludesText'], $last['flightsText'], $flightsCopy, $itinCopy, $last['itineraryPackageId'], $last['fxUsdClp'], $last['fxDate'], $fxManualCopy, $valid, $promised, $reason, $userId);
    $s->execute();
    $newVersionId = $mysqli->insert_id;
    $s->close();
    log_quote_activity($mysqli, $requestId, $userId, 'sistema', 'Nueva versión ' . version_label($quotation['number'], $next) . ' en borrador, comprometida para mañana' . ($reason ? " · $reason" : ''), $newVersionId);
    json_ok(['quotation' => load_quotation($mysqli, $requestId)]);
}

function slugify_es(string $t): string {
    $t = strtr(mb_strtolower($t, 'UTF-8'), ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n']);
    $t = trim(preg_replace('/[^a-z0-9]+/', '-', $t), '-');
    return mb_substr($t ?: 'paquete', 0, 150);
}

// Copia una versión al catálogo como paquete en BORRADOR (el sitio público solo muestra los publicados).
// Se copia lo que sirve para reutilizar: título, incluye/no incluye e itinerario por días. No se copian
// precio, pasajeros, fechas ni vuelos: son del cliente, no del programa.
/** Crea un paquete en BORRADOR con el itinerario, incluye/no incluye y título de la versión. Devuelve el id del paquete. */
function create_draft_package(mysqli $mysqli, array $v, string $title, string $userId): string {
    $days = json_decode($v['itinerary_json'] ?? '[]', true) ?: [];
    $slug = slugify_es($title);
    for ($i = 2; ; $i++) {
        $s = $mysqli->prepare('SELECT 1 FROM packages WHERE slug = ?');
        $s->bind_param('s', $slug);
        $s->execute();
        $taken = $s->get_result()->num_rows > 0;
        $s->close();
        if (!$taken) break;
        $slug = slugify_es($title) . "-$i";
    }
    $pid = new_uuid();
    $subtitle = $v['subtitle'] ?: null;
    $nDays = count($days) ?: null;
    $nNights = $nDays ? max(0, $nDays - 1) : null;
    $inc = $v['includes_text'] ?: null;
    $exc = $v['excludes_text'] ?: null;
    $s = $mysqli->prepare("INSERT INTO packages (id, slug, title, subtitle, duration_days, duration_nights, package_type, price_display_mode,
        price_unit, included, not_included, status, created_by, updated_by) VALUES (?,?,?,?,?,?, 'circuito', 'bajo_consulta', 'per_person', ?,?, 'draft', ?, ?)");
    $s->bind_param('ssssiissss', $pid, $slug, $title, $subtitle, $nDays, $nNights, $inc, $exc, $userId, $userId);
    $s->execute();
    $s->close();
    foreach ($days as $i => $d) {
        $did = new_uuid();
        $num = $i + 1;
        $desc = (string) $d['detail'];
        $s = $mysqli->prepare('INSERT INTO package_itinerary_days (id, package_id, day_number, title, description, sort_order) VALUES (?,?,?,?,?,?)');
        $s->bind_param('ssissi', $did, $pid, $num, $d['title'], $desc, $i);
        $s->execute();
        $s->close();
    }
    return $pid;
}

if ($action === 'to_package' && $method === 'POST') {
    require_auth('packages:edit');
    $v = find_version($mysqli, (int) ($_GET['versionId'] ?? 0));
    $quotation = load_quotation($mysqli, (int) $v['request_id']);
    if ($quotation['packageId']) json_error('Esta cotización ya se guardó como paquete', 409);

    $title = trim((string) $v['title']) ?: 'Programa ' . $quotation['number'];
    $mysqli->begin_transaction();
    $pid = create_draft_package($mysqli, $v, $title, $userId);
    $s = $mysqli->prepare('UPDATE quotations SET package_id = ? WHERE id = ?');
    $s->bind_param('si', $pid, $quotation['id']);
    $s->execute();
    $s->close();
    log_quote_activity($mysqli, (int) $v['request_id'], $userId, 'sistema', 'Cotización ' . version_label((int) $v['number'], (int) $v['version']) . " guardada como paquete en borrador: $title", (int) $v['id']);
    $mysqli->commit();
    json_ok(['packageId' => $pid, 'quotation' => load_quotation($mysqli, (int) $v['request_id'])]);
}

// Guarda el itinerario actual como un paquete NUEVO en borrador (variante), aunque la cotización ya se haya guardado antes.
// No cambia el vínculo de la cotización con su paquete. El nombre lo pone quien guarda, para distinguir variantes.
if ($action === 'save_variant' && $method === 'POST') {
    require_auth('packages:edit');
    $v = find_version($mysqli, (int) ($_GET['versionId'] ?? 0));
    $days = json_decode($v['itinerary_json'] ?? '[]', true) ?: [];
    if (!$days) json_error('Esta versión no tiene itinerario para guardar', 409);
    $title = mb_substr(trim((string) (json_body()['title'] ?? '')), 0, 200);
    if ($title === '') json_error('Escribe un nombre para el nuevo itinerario', 400);
    $mysqli->begin_transaction();
    $pid = create_draft_package($mysqli, $v, $title, $userId);
    log_quote_activity($mysqli, (int) $v['request_id'], $userId, 'sistema', 'Itinerario guardado como paquete nuevo en borrador: ' . $title, (int) $v['id']);
    $mysqli->commit();
    json_ok(['packageId' => $pid]);
}

// Catálogo de itinerarios para el selector: paquetes publicados y en borrador que tengan días. Se filtra en el navegador.
// "keywords" son los títulos de los días (ciudades de la ruta) para poder buscar por ciudad sin enviar todo el texto.
if ($action === 'catalog' && $method === 'GET') {
    require_auth('quotes:edit');
    $mysqli->query('SET SESSION group_concat_max_len = 6000');
    $res = $mysqli->query("SELECT p.id, p.title, p.status, r.name AS region,
            (SELECT COUNT(*) FROM package_itinerary_days d WHERE d.package_id = p.id) AS days,
            (SELECT GROUP_CONCAT(d.title ORDER BY d.sort_order SEPARATOR ' | ') FROM package_itinerary_days d WHERE d.package_id = p.id) AS keywords
        FROM packages p LEFT JOIN regions r ON r.id = p.region_id
        WHERE p.status IN ('published','draft') HAVING days > 0
        ORDER BY (p.status = 'published') DESC, r.name, p.title");
    $out = [];
    while ($r = $res->fetch_assoc()) {
        $out[] = ['id' => $r['id'], 'title' => $r['title'], 'status' => $r['status'], 'region' => $r['region'], 'days' => (int) $r['days'], 'keywords' => (string) $r['keywords']];
    }
    json_ok(['packages' => $out]);
}

if ($action === 'catalog_itinerary' && $method === 'GET') {
    require_auth('quotes:edit');
    $pid = (string) ($_GET['packageId'] ?? '');
    $s = $mysqli->prepare('SELECT title, included, not_included, price_usd, duration_days FROM packages WHERE id = ?');
    $s->bind_param('s', $pid);
    $s->execute();
    $p = $s->get_result()->fetch_assoc();
    $s->close();
    if (!$p) json_error('Paquete no encontrado', 404);
    $s = $mysqli->prepare('SELECT day_number, title, description FROM package_itinerary_days WHERE package_id = ? ORDER BY sort_order');
    $s->bind_param('s', $pid);
    $s->execute();
    $res = $s->get_result();
    $days = [];
    while ($r = $res->fetch_assoc()) {
        $n = $r['day_number'] !== null ? (int) $r['day_number'] : count($days) + 1;
        $t = trim((string) $r['title']);
        $days[] = ['title' => mb_substr($t !== '' ? "Día $n · $t" : "Día $n", 0, 190), 'detail' => (string) $r['description']];
    }
    $s->close();
    json_ok(['title' => $p['title'], 'days' => $days,
        'includes' => trim((string) $p['included']) ?: null, 'excludes' => trim((string) $p['not_included']) ?: null,
        'priceUsd' => $p['price_usd'] !== null ? (float) $p['price_usd'] : null,
        'durationDays' => $p['duration_days'] !== null ? (int) $p['duration_days'] : null]);
}

// Congela la versión y mueve la solicitud a "Cotización enviada".
function mark_version_sent(mysqli $m, array $v, string $userId, string $activityText): void {
    $s = $m->prepare("UPDATE quotation_versions SET status='enviada', sent_at=NOW() WHERE id=?");
    $s->bind_param('i', $v['id']);
    $s->execute();
    $s->close();
    $rid = (int) $v['request_id'];
    $s = $m->prepare("UPDATE quote_requests SET last_contact_at = NOW(), quoted_at = COALESCE(quoted_at, NOW()),
        status = IF(status IN ('nueva','en_seguimiento','respondido'), 'cotizacion_enviada', status) WHERE id = ?");
    $s->bind_param('i', $rid);
    $s->execute();
    $s->close();
    if (!empty($v['fx_usd_clp'])) $activityText .= (!empty($v['fx_manual']) ? ' · montos en USD calculados con un dólar ingresado manualmente de $' : ' · montos en USD calculados al dólar de $') . number_format((float) $v['fx_usd_clp'], 2, ',', '.') . ($v['fx_date'] ? ' (' . $v['fx_date'] . ')' : '');
    log_quote_activity($m, $rid, $userId, 'estado', $activityText, (int) $v['id']);
}

if ($action === 'send' && $method === 'POST') {
    $v = find_version($mysqli, (int) ($_GET['versionId'] ?? 0));
    if ($v['status'] !== 'borrador') json_error('Esta versión ya está marcada como enviada', 409);
    if ((int) $v['total_clp'] <= 0) json_error('El total debe ser mayor a cero antes de enviar', 400);
    mark_version_sent($mysqli, $v, $userId, 'Cotización ' . version_label((int) $v['number'], (int) $v['version']) . ' marcada como enviada');
    json_ok(['quotation' => load_quotation($mysqli, (int) $v['request_id'])]);
}

// Envío por correo. target=review → casilla de revisión (no congela la versión);
// target=client → al correo del pasajero (congela la versión). En ambos va copia OCULTA a gerencia.
if ($action === 'email' && $method === 'POST') {
    $v = find_version($mysqli, (int) ($_GET['versionId'] ?? 0));
    $target = json_body()['target'] ?? '';
    if (!in_array($target, ['review', 'client'], true)) json_error('Destino inválido', 400);
    if ((int) $v['total_clp'] <= 0) json_error('El total debe ser mayor a cero antes de enviar', 400);
    $s = $mysqli->prepare('SELECT folio, brand, passenger_name, passenger_email FROM quote_requests WHERE id = ?');
    $s->bind_param('i', $v['request_id']);
    $s->execute();
    $req = $s->get_result()->fetch_assoc();
    $s->close();

    $label = version_label((int) $v['number'], (int) $v['version']);
    $brandName = $req['brand'] === 'travel_viajes' ? 'Travel Viajes' : 'Travel Online';
    $reviewTo = defined('MAIL_REVIEW_TO') ? MAIL_REVIEW_TO : '';
    $bcc = defined('MAIL_BCC_BOSS') && MAIL_BCC_BOSS !== '' ? MAIL_BCC_BOSS : null;
    $first = qe_h(explode(' ', trim($req['passenger_name']))[0]);

    if ($target === 'review') {
        if ($reviewTo === '') json_error('No hay casilla de revisión configurada', 500);
        $panel = (defined('ADMIN_PUBLIC_URL') ? rtrim(ADMIN_PUBLIC_URL, '/') : '') . '/cotizacion/' . (int) $v['id'] . '/pdf';
        $intro = 'Cotización para <b>revisión interna</b>, aún no enviada al cliente. Revísala con calma; si todo está correcto, reenvíala a <b>'
            . qe_h($req['passenger_email'] ?: 'el correo del cliente') . '</b>.';
        $subject = '[' . $req['folio'] . "] REVISIÓN · Cotización $label · " . $req['passenger_name'];
        $ok = send_html_mail($reviewTo, $subject, render_quote_email($v, $req, $brandName, $intro, $panel), $bcc, $session['user']['email']);
        if (!$ok) json_error('No se pudo enviar el correo', 500);
        log_quote_activity($mysqli, (int) $v['request_id'], $userId, 'sistema', "Cotización $label enviada a $reviewTo para revisión", (int) $v['id']);
    } else {
        $email = (string) $req['passenger_email'];
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('La solicitud no tiene un correo de cliente válido', 400);
        $intro = "Hola $first, gracias por contactarnos. Te enviamos tu cotización. Para cualquier duda o cambio, responde este correo y mantén el código <b>"
            . qe_h($req['folio']) . '</b> en el asunto.';
        $subject = '[' . $req['folio'] . "] Tu cotización de viaje N° $label · $brandName";
        $ok = send_html_mail($email, $subject, render_quote_email($v, $req, $brandName, $intro), $bcc, $reviewTo ?: null);
        if (!$ok) json_error('No se pudo enviar el correo', 500);
        if ($v['status'] === 'borrador') {
            mark_version_sent($mysqli, $v, $userId, "Cotización $label enviada al cliente por correo ($email)");
        } else {
            log_quote_activity($mysqli, (int) $v['request_id'], $userId, 'estado', "Cotización $label reenviada al cliente por correo ($email)", (int) $v['id']);
        }
    }
    json_ok(['sent' => true]);
}

json_error('Ruta no encontrada', 404);
