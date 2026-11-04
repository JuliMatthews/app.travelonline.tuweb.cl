<?php
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Solo se ejecuta desde la terminal.'); }
// Carga en el CRM las solicitudes rescatadas del buzón info@travelviajes.cl (reenvío caído jun-nov 2026).
// Una solicitud por cliente (unificado por correo/teléfono): marca Travel Viajes, canal correo, estado "nueva",
// SIN contacto registrado (así la lista muestra "Por atender" y el reloj de alertas corre desde su primer mensaje).
// Lo que pidió queda en details_json -> "recuperado". Se puede repetir sin duplicar (salta los ya cargados).
// Requisito: db/migration-crm-recuperados.sql ya aplicada.
// Uso: php scripts/importar-rescatados.php <leads-rescatados.json> [--dry]
require_once __DIR__ . '/../inc/db.php';
$file = $argv[1] ?? '';
$dry = in_array('--dry', $argv, true);
if (!is_file($file)) exit("Uso: php scripts/importar-rescatados.php <leads-rescatados.json> [--dry]\n");
$leads = json_decode(file_get_contents($file), true);
if (!is_array($leads)) exit("JSON inválido\n");
$db = db();
$db->set_charset('utf8mb4');

function clean_dest(string $s): string { return trim(preg_replace('/^[\s\-–]+/u', '', $s)); }
function parse_dmy(string $s): array {
    preg_match_all('/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/', $s, $m, PREG_SET_ORDER);
    $d = array_map(fn($x) => sprintf('%04d-%02d-%02d', $x[3], $x[2], $x[1]), $m);
    return [$d[0] ?? null, $d[1] ?? null];
}

/** Ficha en /clientes (una por correo). Sin contraseña: si después se registra en el sitio, hereda su historial. */
function ensure_client(mysqli $db, string $email, string $name, string $phone, string $created, string $note): ?string {
    if ($email === '') return null;
    $s = $db->prepare('SELECT id FROM clients WHERE email = ?');
    $s->bind_param('s', $email); $s->execute();
    $r = $s->get_result()->fetch_assoc(); $s->close();
    if ($r) return $r['id'];
    $id = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x', mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0x0fff) | 0x4000, mt_rand(0, 0x3fff) | 0x8000, mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff));
    $phoneOrNull = $phone !== '' ? $phone : null;
    $s = $db->prepare('INSERT INTO clients (id, email, name, phone, internal_notes, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    $s->bind_param('ssssss', $id, $email, $name, $phoneOrNull, $note, $created); $s->execute(); $s->close();
    return $id;
}

$new = $skip = 0;
foreach ($leads as $L) {
    $email = strtolower(trim($L['email'] ?? ''));
    $phone = preg_replace('/\D/', '', $L['tel'] ?? '');
    $stmt = $db->prepare("SELECT id FROM quote_requests WHERE recovered = 1 AND ((? <> '' AND LOWER(passenger_email) = ?) OR (? <> '' AND REPLACE(REPLACE(passenger_phone,'+',''),' ','') = ?)) LIMIT 1");
    $stmt->bind_param('ssss', $email, $email, $phone, $phone);
    $stmt->execute();
    $exists = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($exists) {
        // Ya cargada antes: solo asegura su ficha de cliente y el enlace (permite reparar cargas previas).
        if (!$dry && $email !== '') {
            $s = $db->prepare('SELECT passenger_name, passenger_phone, created_at, client_id FROM quote_requests WHERE id = ?');
            $s->bind_param('i', $exists['id']); $s->execute();
            $q = $s->get_result()->fetch_assoc(); $s->close();
            if ($q && $q['client_id'] === null) {
                $cid = ensure_client($db, $email, $q['passenger_name'], $q['passenger_phone'], $q['created_at'], 'Rescatado del correo info@travelviajes.cl (reenvío caído jun-nov 2026).');
                $s = $db->prepare('UPDATE quote_requests SET client_id = ? WHERE id = ?');
                $s->bind_param('si', $cid, $exists['id']); $s->execute(); $s->close();
            }
        }
        $skip++; continue;
    }

    $ms = $L['mensajes'];
    $last = end($ms);
    $dests = [];
    foreach ($ms as $m) { $d = clean_dest($m['destino'] ?: $m['asunto']); if ($d !== '' && !in_array($d, $dests, true)) $dests[] = $d; }
    $dest = mb_substr(implode('; ', $dests), 0, 190) ?: null;
    $posventa = ($L['categoria'] ?? '') === 'Posventa';
    $rtype = $posventa ? 'problema' : 'a_medida';
    $adults = 1;
    foreach (array_reverse($ms) as $m) if (preg_match('/\d+/', $m['pax'] ?? '', $x)) { $adults = max(1, min(50, (int) $x[0])); break; }
    [$from, $to] = [null, null];
    foreach (array_reverse($ms) as $m) if (!empty($m['fechasViaje'])) { [$from, $to] = parse_dmy($m['fechasViaje']); if ($from) break; }
    $created = $L['primer'] . ':00';
    $name = mb_substr(trim($L['nombre']) ?: ($email ?: 'Sin nombre'), 0, 255);
    $emailOrNull = $email !== '' ? $email : null;
    $comments = $last['texto'] !== '' ? $last['texto'] : null;
    $rec = ['categoria' => $L['categoria'], 'origen' => $L['origen'], 'primerMensaje' => $L['primer'], 'ultimoMensaje' => $L['ultimo'], 'mensajes' => $ms];
    $details = json_encode(['recuperado' => $rec], JSON_UNESCAPED_UNICODE);
    $phoneStr = $L['tel'] ? '+' . ltrim($L['tel'], '+') : '';

    if ($dry) { echo "[dry] $name <$email> $phoneStr · $rtype · $dest · $created · {$adults}p · " . count($ms) . " msg\n"; $new++; continue; }
    $stmt = $db->prepare("INSERT INTO quote_requests (request_type, channel, brand, recovered, destination_text, adults, children, selected_addons_json,
        passenger_name, passenger_email, passenger_phone, comments, details_json, preferred_date_from, preferred_date_to, status, created_at)
        VALUES (?, 'correo', 'travel_viajes', 1, ?, ?, 0, '[]', ?, ?, ?, ?, ?, ?, ?, 'nueva', ?)");
    $stmt->bind_param('ssissssssss', $rtype, $dest, $adults, $name, $emailOrNull, $phoneStr, $comments, $details, $from, $to, $created);
    $stmt->execute();
    $id = $stmt->insert_id;
    $stmt->close();
    $cid = ensure_client($db, $email, $name, $phoneStr, $created, 'Rescatado del correo info@travelviajes.cl (reenvío caído jun-nov 2026). Primer mensaje: ' . substr($L['primer'], 0, 10) . '.');
    if ($cid) {
        $stmt = $db->prepare('UPDATE quote_requests SET client_id = ? WHERE id = ?');
        $stmt->bind_param('si', $cid, $id); $stmt->execute(); $stmt->close();
    }
    $folio = sprintf('TOL-%s-%04d', date('ymd', strtotime($created)), $id % 10000);
    $stmt = $db->prepare('UPDATE quote_requests SET folio = ? WHERE id = ?');
    $stmt->bind_param('si', $folio, $id);
    $stmt->execute();
    $stmt->close();
    $body = 'Rescatada del correo info@travelviajes.cl (primer mensaje: ' . substr($L['primer'], 0, 10) . ', ' . count($ms) . ' mensaje' . (count($ms) === 1 ? '' : 's') . '). Sin contactar hasta ahora.';
    $stmt = $db->prepare("INSERT INTO quote_activity (quote_id, author_id, kind, body) VALUES (?, NULL, 'sistema', ?)");
    $stmt->bind_param('is', $id, $body);
    $stmt->execute();
    $stmt->close();
    $new++;
}
echo ($dry ? "[SIMULACIÓN] " : "") . "Nuevas: $new · ya existían (omitidas): $skip · total en el archivo: " . count($leads) . "\n";
