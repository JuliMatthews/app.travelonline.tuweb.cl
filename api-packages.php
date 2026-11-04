<?php
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
require_once __DIR__ . '/inc/package_gaps.php';
install_json_error_handlers();

$session = require_auth('packages:view');
$user = $session['user'];
$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'];
$mysqli = db();

function package_summary_row(array $row): array {
    return [
        'id' => $row['id'],
        'slug' => $row['slug'],
        'title' => $row['title'],
        'subtitle' => $row['subtitle'],
        'packageType' => $row['package_type'],
        'region' => $row['region_id'] ? ['id' => $row['region_id'], 'slug' => $row['region_slug'], 'name' => $row['region_name']] : null,
        'status' => $row['status'],
        'priceDisplayMode' => $row['price_display_mode'],
        'priceFromClp' => $row['price_from_clp'] !== null ? (int) $row['price_from_clp'] : null,
        'isFeatured' => (bool) $row['is_featured'],
        'showInPromociones' => (bool) $row['show_in_promociones'],
        'updatedAt' => $row['updated_at'],
        'operatorId' => isset($row['operator_id']) && $row['operator_id'] !== null ? (int) $row['operator_id'] : null,
        'operatorName' => $row['operator_name'] ?? null,
        'priceUsd' => isset($row['price_usd']) && $row['price_usd'] !== null ? (float) $row['price_usd'] : null,
        'tariffValidUntil' => $row['tariff_valid_until'] ?? null,
        'tariffExpired' => !empty($row['tariff_valid_until']) && $row['tariff_valid_until'] < date('Y-m-d'),
        'departuresText' => $row['departures_text'] ?? null,
    ];
}

if ($action === 'list' && $method === 'GET') {
    $res = $mysqli->query(
        'SELECT p.id, p.slug, p.title, p.subtitle, p.package_type, p.status,
                p.price_display_mode, p.price_from_clp, p.is_featured, p.show_in_promociones, p.updated_at,
                p.content, p.duration_days, p.duration_nights, p.included, p.not_included,
                (SELECT COUNT(*) FROM package_itinerary_days d WHERE d.package_id = p.id) AS itin_days,
                p.operator_id, o.name AS operator_name, p.price_usd, p.tariff_valid_until, p.departures_text,
                (SELECT MIN(dp.departs_on) FROM package_departures dp WHERE dp.package_id = p.id AND dp.departs_on >= CURDATE()) AS next_departure,
                (SELECT COUNT(*) FROM package_departures dp WHERE dp.package_id = p.id AND dp.departs_on >= CURDATE()) AS future_departures,
                (SELECT COUNT(*) FROM package_images i WHERE i.package_id = p.id) AS img_count,
                (SELECT COUNT(*) FROM quote_requests q WHERE (q.package_id = p.id OR q.package_slug = p.slug)
                    AND q.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS quotes_30d,
                r.id AS region_id, r.slug AS region_slug, r.name AS region_name
         FROM packages p LEFT JOIN regions r ON r.id = p.region_id
         LEFT JOIN operators o ON o.id = p.operator_id
         ORDER BY p.title'
    );
    $rows = [];
    while ($row = $res->fetch_assoc()) {
        // 'foto' se agrega solo aquí: el Excel para completar no puede traer fotos, así que no la cuenta como faltante.
        $gaps = package_gaps($row);
        if ((int) $row['img_count'] === 0) $gaps[] = 'foto';
        $rows[] = package_summary_row($row) + ['gaps' => $gaps, 'quotes30' => (int) $row['quotes_30d'], 'nextDeparture' => $row['next_departure'], 'futureDepartures' => (int) $row['future_departures']];
    }
    json_ok(['packages' => $rows]);
}

if ($action === 'regions' && $method === 'GET') {
    $res = $mysqli->query('SELECT id, slug, name FROM regions ORDER BY sort_order');
    $rows = [];
    while ($row = $res->fetch_assoc()) $rows[] = $row;
    json_ok(['regions' => $rows]);
}

if ($action === 'get' && $method === 'GET') {
    $id = $_GET['id'] ?? '';
    $stmt = $mysqli->prepare(
        'SELECT p.*, r.id AS region_id, r.slug AS region_slug, r.name AS region_name, o.name AS operator_name
         FROM packages p LEFT JOIN regions r ON r.id = p.region_id
         LEFT JOIN operators o ON o.id = p.operator_id
         WHERE p.id = ?'
    );
    $stmt->bind_param('s', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) json_error('Paquete no encontrado', 404);

    $addons = [];
    $stmt = $mysqli->prepare('SELECT id, name, price_clp FROM package_addons WHERE package_id = ? ORDER BY sort_order');
    $stmt->bind_param('s', $id);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($r = $res->fetch_assoc()) $addons[] = ['id' => $r['id'], 'name' => $r['name'], 'priceClp' => (int) $r['price_clp']];
    $stmt->close();

    $roomOptions = [];
    $stmt = $mysqli->prepare('SELECT id, label, price_adjustment_clp FROM package_room_options WHERE package_id = ? ORDER BY sort_order');
    $stmt->bind_param('s', $id);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($r = $res->fetch_assoc()) $roomOptions[] = ['id' => $r['id'], 'label' => $r['label'], 'priceAdjustmentClp' => (int) $r['price_adjustment_clp']];
    $stmt->close();

    $itinerary = [];
    $stmt = $mysqli->prepare('SELECT id, day_number, title, description FROM package_itinerary_days WHERE package_id = ? ORDER BY sort_order');
    $stmt->bind_param('s', $id);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($r = $res->fetch_assoc()) $itinerary[] = ['id' => $r['id'], 'dayNumber' => $r['day_number'] !== null ? (int) $r['day_number'] : null, 'title' => $r['title'], 'description' => $r['description']];
    $stmt->close();

    $images = [];
    $stmt = $mysqli->prepare(
        'SELECT i.id, i.file_extension, i.alt_text FROM package_images pi
         JOIN images i ON i.id = pi.image_id WHERE pi.package_id = ? ORDER BY pi.sort_order'
    );
    $stmt->bind_param('s', $id);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($r = $res->fetch_assoc()) $images[] = ['id' => $r['id'], 'extension' => $r['file_extension'], 'altText' => $r['alt_text']];
    $stmt->close();

    $pkg = package_summary_row($row);
    $pkg['content'] = $row['content'];
    $pkg['durationDays'] = $row['duration_days'] !== null ? (int) $row['duration_days'] : null;
    $pkg['durationNights'] = $row['duration_nights'] !== null ? (int) $row['duration_nights'] : null;
    $pkg['priceToClp'] = $row['price_to_clp'] !== null ? (int) $row['price_to_clp'] : null;
    $pkg['priceUnit'] = $row['price_unit'];
    $pkg['included'] = $row['included'];
    $pkg['notIncluded'] = $row['not_included'];
    $pkg['internalNotes'] = $row['internal_notes'] ?? null;
    $pkg['featuredSortOrder'] = $row['featured_sort_order'] !== null ? (int) $row['featured_sort_order'] : null;
    $pkg['addons'] = $addons;
    $pkg['roomOptions'] = $roomOptions;
    $pkg['itinerary'] = $itinerary;
    $pkg['images'] = $images;
    $deps = [];
    $stmt = $mysqli->prepare('SELECT id, departs_on, tier, price_usd, seats, note FROM package_departures WHERE package_id = ? ORDER BY departs_on, tier');
    $stmt->bind_param('s', $id);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($r = $res->fetch_assoc()) $deps[] = ['id' => (int) $r['id'], 'departsOn' => $r['departs_on'], 'tier' => $r['tier'], 'priceUsd' => $r['price_usd'] !== null ? (float) $r['price_usd'] : null, 'seats' => $r['seats'] !== null ? (int) $r['seats'] : null, 'note' => $r['note']];
    $stmt->close();
    $pkg['departures'] = $deps;
    json_ok(['package' => $pkg]);
}

/** Proveedor, precio en USD, vigencia y salidas. Solo se toca lo que viene en el JSON (los demás llamadores no cambian). */
function save_extras(mysqli $mysqli, string $packageId, array $input): void {
    if (array_key_exists('operatorId', $input) || array_key_exists('priceUsd', $input) || array_key_exists('tariffValidUntil', $input) || array_key_exists('departuresText', $input)) {
        $op = isset($input['operatorId']) && $input['operatorId'] !== '' && $input['operatorId'] !== null ? (int) $input['operatorId'] : null;
        $usd = isset($input['priceUsd']) && $input['priceUsd'] !== '' && $input['priceUsd'] !== null ? round((float) $input['priceUsd'], 2) : null;
        $valid = !empty($input['tariffValidUntil']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $input['tariffValidUntil']) ? $input['tariffValidUntil'] : null;
        $txt = isset($input['departuresText']) ? mb_substr(trim((string) $input['departuresText']), 0, 255) : '';
        $txt = $txt !== '' ? $txt : null;
        $s = $mysqli->prepare('UPDATE packages SET operator_id = ?, price_usd = ?, tariff_valid_until = ?, departures_text = ? WHERE id = ?');
        $s->bind_param('idsss', $op, $usd, $valid, $txt, $packageId);
        $s->execute();
        $s->close();
    }
    if (array_key_exists('departures', $input) && is_array($input['departures'])) {
        $d = $mysqli->prepare('DELETE FROM package_departures WHERE package_id = ?');
        $d->bind_param('s', $packageId);
        $d->execute();
        $d->close();
        foreach (array_slice($input['departures'], 0, 400) as $x) {
            $date = (string) ($x['departsOn'] ?? '');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !checkdate((int) substr($date, 5, 2), (int) substr($date, 8, 2), (int) substr($date, 0, 4))) continue;
            $tier = isset($x['tier']) && trim((string) $x['tier']) !== '' ? mb_substr(trim((string) $x['tier']), 0, 60) : null;
            $price = isset($x['priceUsd']) && $x['priceUsd'] !== '' && $x['priceUsd'] !== null ? round((float) $x['priceUsd'], 2) : null;
            $seats = isset($x['seats']) && $x['seats'] !== '' && $x['seats'] !== null ? (int) $x['seats'] : null;
            $note = isset($x['note']) && trim((string) $x['note']) !== '' ? mb_substr(trim((string) $x['note']), 0, 255) : null;
            $i = $mysqli->prepare('INSERT IGNORE INTO package_departures (package_id, departs_on, tier, price_usd, seats, note) VALUES (?, ?, ?, ?, ?, ?)');
            $i->bind_param('sssdis', $packageId, $date, $tier, $price, $seats, $note);
            $i->execute();
            $i->close();
        }
    }
}

function replace_children(mysqli $mysqli, string $packageId, array $input): void {
    $del = $mysqli->prepare('DELETE FROM package_addons WHERE package_id = ?');
    $del->bind_param('s', $packageId);
    $del->execute();
    $del->close();
    foreach (($input['addons'] ?? []) as $i => $a) {
        $stmt = $mysqli->prepare('INSERT INTO package_addons (id, package_id, name, price_clp, sort_order) VALUES (?, ?, ?, ?, ?)');
        $newId = new_uuid();
        $price = (int) $a['priceClp'];
        $stmt->bind_param('sssii', $newId, $packageId, $a['name'], $price, $i);
        $stmt->execute();
        $stmt->close();
    }

    $del = $mysqli->prepare('DELETE FROM package_room_options WHERE package_id = ?');
    $del->bind_param('s', $packageId);
    $del->execute();
    $del->close();
    foreach (($input['roomOptions'] ?? []) as $i => $r) {
        $stmt = $mysqli->prepare('INSERT INTO package_room_options (id, package_id, label, price_adjustment_clp, sort_order) VALUES (?, ?, ?, ?, ?)');
        $newId = new_uuid();
        $adj = (int) $r['priceAdjustmentClp'];
        $stmt->bind_param('sssii', $newId, $packageId, $r['label'], $adj, $i);
        $stmt->execute();
        $stmt->close();
    }

    $del = $mysqli->prepare('DELETE FROM package_itinerary_days WHERE package_id = ?');
    $del->bind_param('s', $packageId);
    $del->execute();
    $del->close();
    foreach (($input['itinerary'] ?? []) as $i => $d) {
        $stmt = $mysqli->prepare('INSERT INTO package_itinerary_days (id, package_id, day_number, title, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
        $newId = new_uuid();
        $dayNumber = $d['dayNumber'] !== null ? (int) $d['dayNumber'] : null;
        $stmt->bind_param('ssissi', $newId, $packageId, $dayNumber, $d['title'], $d['description'], $i);
        $stmt->execute();
        $stmt->close();
    }

    $del = $mysqli->prepare('DELETE FROM package_images WHERE package_id = ?');
    $del->bind_param('s', $packageId);
    $del->execute();
    $del->close();
    foreach (($input['imageIds'] ?? []) as $i => $imageId) {
        $stmt = $mysqli->prepare('INSERT INTO package_images (package_id, image_id, sort_order) VALUES (?, ?, ?)');
        $stmt->bind_param('ssi', $packageId, $imageId, $i);
        $stmt->execute();
        $stmt->close();
    }
}

if ($action === 'create' && $method === 'POST') {
    require_auth('packages:create');
    $input = json_body();
    $id = new_uuid();
    $stmt = $mysqli->prepare(
        'INSERT INTO packages (
           id, slug, title, subtitle, content, duration_days, duration_nights,
           package_type, price_display_mode, price_from_clp, price_to_clp, price_unit,
           included, not_included, internal_notes, region_id, is_featured, featured_sort_order,
           show_in_promociones, status, created_by, updated_by
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    $subtitle = str_field($input, 'subtitle') ?: null;
    $content = str_field($input, 'content') ?: null;
    $durationDays = int_or_null($input, 'durationDays');
    $durationNights = int_or_null($input, 'durationNights');
    $priceFromClp = int_or_null($input, 'priceFromClp');
    $priceToClp = int_or_null($input, 'priceToClp');
    $included = str_field($input, 'included') ?: null;
    $notIncluded = str_field($input, 'notIncluded') ?: null;
    $internalNotes = mb_substr(str_field($input, 'internalNotes'), 0, 8000) ?: null;
    $regionId = $input['regionId'] ?: null;
    $isFeatured = !empty($input['isFeatured']) ? 1 : 0;
    $featuredSortOrder = int_or_null($input, 'featuredSortOrder');
    $showInPromociones = !empty($input['showInPromociones']) ? 1 : 0;
    $stmt->bind_param(
        'sssssiissiisssssiiisss',
        $id, $input['slug'], $input['title'], $subtitle, $content, $durationDays, $durationNights,
        $input['packageType'], $input['priceDisplayMode'], $priceFromClp, $priceToClp, $input['priceUnit'],
        $included, $notIncluded, $internalNotes, $regionId, $isFeatured, $featuredSortOrder,
        $showInPromociones, $input['status'], $user['id'], $user['id']
    );
    if (!$stmt->execute()) {
        $stmt->close();
        if ($mysqli->errno === 1062) json_error('Ya existe un paquete con ese slug', 409);
        json_error('No se pudo crear el paquete', 500);
    }
    $stmt->close();
    replace_children($mysqli, $id, $input);
    save_extras($mysqli, $id, $input);
    json_ok(['id' => $id]);
}

if ($action === 'update' && $method === 'POST') {
    require_auth('packages:edit');
    $id = $_GET['id'] ?? '';
    $input = json_body();
    $subtitle = str_field($input, 'subtitle') ?: null;
    $content = str_field($input, 'content') ?: null;
    $durationDays = int_or_null($input, 'durationDays');
    $durationNights = int_or_null($input, 'durationNights');
    $priceFromClp = int_or_null($input, 'priceFromClp');
    $priceToClp = int_or_null($input, 'priceToClp');
    $included = str_field($input, 'included') ?: null;
    $notIncluded = str_field($input, 'notIncluded') ?: null;
    $internalNotes = mb_substr(str_field($input, 'internalNotes'), 0, 8000) ?: null;
    $regionId = $input['regionId'] ?: null;
    $isFeatured = !empty($input['isFeatured']) ? 1 : 0;
    $featuredSortOrder = int_or_null($input, 'featuredSortOrder');
    $showInPromociones = !empty($input['showInPromociones']) ? 1 : 0;

    $stmt = $mysqli->prepare(
        'UPDATE packages SET
           slug=?, title=?, subtitle=?, content=?, duration_days=?, duration_nights=?,
           package_type=?, price_display_mode=?, price_from_clp=?, price_to_clp=?, price_unit=?,
           included=?, not_included=?, internal_notes=?, region_id=?, is_featured=?, featured_sort_order=?,
           show_in_promociones=?, status=?, updated_by=?
         WHERE id=?'
    );
    $stmt->bind_param(
        'ssssiissiisssssiiisss',
        $input['slug'], $input['title'], $subtitle, $content, $durationDays, $durationNights,
        $input['packageType'], $input['priceDisplayMode'], $priceFromClp, $priceToClp, $input['priceUnit'],
        $included, $notIncluded, $internalNotes, $regionId, $isFeatured, $featuredSortOrder,
        $showInPromociones, $input['status'], $user['id'], $id
    );
    if (!$stmt->execute()) {
        $stmt->close();
        if ($mysqli->errno === 1062) json_error('Ya existe un paquete con ese slug', 409);
        json_error('No se pudo actualizar el paquete', 500);
    }
    $stmt->close();
    replace_children($mysqli, $id, $input);
    save_extras($mysqli, $id, $input);
    json_ok(['id' => $id]);
}

if ($action === 'delete' && $method === 'POST') {
    require_auth('packages:delete');
    $id = $_GET['id'] ?? '';
    $stmt = $mysqli->prepare('DELETE FROM packages WHERE id = ?');
    $stmt->bind_param('s', $id);
    $stmt->execute();
    $stmt->close();
    json_ok([]);
}

// Acciones masivas: publicar / pasar a borrador / archivar / cambiar región o tipo de varios programas a la vez.
// Publicar solo aplica a los que ya tienen lo mínimo (PACKAGE_PUBLISH_MIN); los demás se devuelven en "skipped".
if ($action === 'bulk' && $method === 'POST') {
    $session = require_auth('packages:edit');
    $input = json_body();
    $ids = array_values(array_unique(array_filter((array) ($input['ids'] ?? []), 'is_string')));
    $op = (string) ($input['op'] ?? '');
    $value = (string) ($input['value'] ?? '');
    if (count($ids) < 1 || count($ids) > 300) json_error('Elige entre 1 y 300 programas.');
    if (!in_array($op, ['publish', 'draft', 'archive', 'region', 'type'], true)) json_error('Acción no válida.');

    $regionId = null;
    if ($op === 'region') {
        $s = $mysqli->prepare('SELECT id FROM regions WHERE slug = ?');
        $s->bind_param('s', $value);
        $s->execute();
        $regionId = ($s->get_result()->fetch_assoc()['id'] ?? null);
        $s->close();
        if (!$regionId) json_error('Región no válida.');
    }
    if ($op === 'type' && !in_array($value, ['circuito', 'todo_incluido', 'combinado', 'promocion_2x1'], true)) json_error('Tipo no válido.');

    $marks = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $mysqli->prepare(
        "SELECT p.id, p.title, p.status, p.content, p.price_display_mode, p.price_from_clp, p.duration_days, p.duration_nights,
                p.included, p.not_included,
                (SELECT COUNT(*) FROM package_itinerary_days d WHERE d.package_id = p.id) AS itin_days,
                (SELECT COUNT(*) FROM package_images i WHERE i.package_id = p.id) AS img_count
         FROM packages p WHERE p.id IN ($marks)"
    );
    $stmt->bind_param(str_repeat('s', count($ids)), ...$ids);
    $stmt->execute();
    $res = $stmt->get_result();

    $ok = [];
    $skipped = [];
    while ($row = $res->fetch_assoc()) {
        if ($op === 'publish') {
            $gaps = package_gaps($row);
            if ((int) $row['img_count'] === 0) $gaps[] = 'foto';
            $missing = array_values(array_intersect($gaps, PACKAGE_PUBLISH_MIN));
            if ($missing) {
                $skipped[] = ['id' => $row['id'], 'title' => $row['title'], 'why' => 'le falta: ' . implode(', ', array_map(fn($g) => PACKAGE_GAP_LABELS[$g] ?? 'foto', $missing))];
                continue;
            }
        }
        $ok[] = $row['id'];
    }
    $stmt->close();

    $updated = 0;
    if ($ok) {
        $m = implode(',', array_fill(0, count($ok), '?'));
        $uid = $session['user']['id'];
        switch ($op) {
            case 'publish': $set = "status='published'"; $extra = []; break;
            case 'draft': $set = "status='draft'"; $extra = []; break;
            case 'archive': $set = "status='archived'"; $extra = []; break;
            case 'region': $set = 'region_id=?'; $extra = [$regionId]; break;
            default: $set = 'package_type=?'; $extra = [$value];
        }
        $upd = $mysqli->prepare("UPDATE packages SET $set, updated_by=? WHERE id IN ($m)");
        $params = array_merge($extra, [$uid], $ok);
        $upd->bind_param(str_repeat('s', count($params)), ...$params);
        $upd->execute();
        $updated = $upd->affected_rows;
        $upd->close();
    }
    json_ok(['updated' => $updated, 'requested' => count($ids), 'skipped' => $skipped]);
}

json_error('Ruta no encontrada', 404);
