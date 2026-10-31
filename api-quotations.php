<?php
// Cotizaciones versionadas. Una solicitud → una cotización (N° 1001…) → versiones (1001.1, 1001.2…).
// Borrador = editable; enviada = congelada (un cambio crea una versión nueva).
// Los totales SIEMPRE se recalculan acá; nunca se confía en el total que manda el navegador.
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
require_once __DIR__ . '/inc/quote_email.php';
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
        'changeReason' => $r['change_reason'], 'createdAt' => $r['created_at'], 'updatedAt' => $r['updated_at'], 'sentAt' => $r['sent_at'],
        'createdByName' => $r['created_by_name'] ?? null,
    ];
}

const VERSION_SELECT = 'SELECT v.*, u.name AS created_by_name FROM quotation_versions v LEFT JOIN users u ON u.id = v.created_by';

function load_quotation(mysqli $m, int $requestId): ?array {
    $s = $m->prepare('SELECT id, request_id, number FROM quotations WHERE request_id = ?');
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
    return ['id' => (int) $q['id'], 'requestId' => (int) $q['request_id'], 'number' => (int) $q['number'], 'versions' => $versions];
}

// Limpia y valida las líneas; devuelve [líneas, total].
function clean_lines($raw, $discount): array {
    if (!is_array($raw)) json_error('Líneas inválidas', 400);
    $lines = [];
    $subtotal = 0;
    foreach (array_slice($raw, 0, 40) as $l) {
        if (!is_array($l)) continue;
        $title = trim((string) ($l['title'] ?? ''));
        if ($title === '') continue;
        $amount = max(0, (int) round((float) ($l['amountClp'] ?? 0)));
        $lines[] = ['title' => mb_substr($title, 0, 190), 'detail' => mb_substr(trim((string) ($l['detail'] ?? '')), 0, 500), 'amountClp' => $amount];
        $subtotal += $amount;
    }
    if (!$lines) json_error('Agrega al menos una línea con descripción', 400);
    $disc = max(0, (int) round((float) $discount));
    if ($disc > $subtotal) json_error('El descuento no puede superar el subtotal', 400);
    return [$lines, $subtotal - $disc];
}

function save_fields(mysqli $m, int $versionId, array $in): void {
    [$lines, $total] = clean_lines($in['lines'] ?? null, $in['discountClp'] ?? 0);
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
    $s = $m->prepare('UPDATE quotation_versions SET title=?, subtitle=?, pax=?, lines_json=?, discount_clp=?, discount_label=?, total_clp=?,
        includes_text=?, excludes_text=?, valid_until=?, change_reason=? WHERE id=?');
    $s->bind_param('ssisisissssi', $title, $subtitle, $pax, $json, $disc, $discLabel, $total, $inc, $exc, $valid, $reason, $versionId);
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
        includes_text, excludes_text, valid_until, change_reason, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    $s->bind_param('iissisisisssss', $quotation['id'], $next, $last['title'], $last['subtitle'], $last['pax'], $json, $last['discountClp'],
        $last['discountLabel'], $last['totalClp'], $last['includesText'], $last['excludesText'], $valid, $reason, $userId);
    $s->execute();
    $newVersionId = $mysqli->insert_id;
    $s->close();
    log_quote_activity($mysqli, $requestId, $userId, 'sistema', 'Nueva versión ' . version_label($quotation['number'], $next) . ' en borrador' . ($reason ? " · $reason" : ''), $newVersionId);
    json_ok(['quotation' => load_quotation($mysqli, $requestId)]);
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
