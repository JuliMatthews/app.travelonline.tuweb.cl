<?php
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
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
    ];
}

if ($action === 'list' && $method === 'GET') {
    $res = $mysqli->query(
        'SELECT p.id, p.slug, p.title, p.subtitle, p.package_type, p.status,
                p.price_display_mode, p.price_from_clp, p.is_featured, p.show_in_promociones, p.updated_at,
                r.id AS region_id, r.slug AS region_slug, r.name AS region_name
         FROM packages p LEFT JOIN regions r ON r.id = p.region_id
         ORDER BY p.title'
    );
    $rows = [];
    while ($row = $res->fetch_assoc()) $rows[] = package_summary_row($row);
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
        'SELECT p.*, r.id AS region_id, r.slug AS region_slug, r.name AS region_name
         FROM packages p LEFT JOIN regions r ON r.id = p.region_id
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
    $pkg['featuredSortOrder'] = $row['featured_sort_order'] !== null ? (int) $row['featured_sort_order'] : null;
    $pkg['addons'] = $addons;
    $pkg['roomOptions'] = $roomOptions;
    $pkg['itinerary'] = $itinerary;
    $pkg['images'] = $images;
    json_ok(['package' => $pkg]);
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
           included, not_included, region_id, is_featured, featured_sort_order,
           show_in_promociones, status, created_by, updated_by
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    $subtitle = str_field($input, 'subtitle') ?: null;
    $content = str_field($input, 'content') ?: null;
    $durationDays = int_or_null($input, 'durationDays');
    $durationNights = int_or_null($input, 'durationNights');
    $priceFromClp = int_or_null($input, 'priceFromClp');
    $priceToClp = int_or_null($input, 'priceToClp');
    $included = str_field($input, 'included') ?: null;
    $notIncluded = str_field($input, 'notIncluded') ?: null;
    $regionId = $input['regionId'] ?: null;
    $isFeatured = !empty($input['isFeatured']) ? 1 : 0;
    $featuredSortOrder = int_or_null($input, 'featuredSortOrder');
    $showInPromociones = !empty($input['showInPromociones']) ? 1 : 0;
    $stmt->bind_param(
        'sssssiissiissssiiisss',
        $id, $input['slug'], $input['title'], $subtitle, $content, $durationDays, $durationNights,
        $input['packageType'], $input['priceDisplayMode'], $priceFromClp, $priceToClp, $input['priceUnit'],
        $included, $notIncluded, $regionId, $isFeatured, $featuredSortOrder,
        $showInPromociones, $input['status'], $user['id'], $user['id']
    );
    if (!$stmt->execute()) {
        $stmt->close();
        if ($mysqli->errno === 1062) json_error('Ya existe un paquete con ese slug', 409);
        json_error('No se pudo crear el paquete', 500);
    }
    $stmt->close();
    replace_children($mysqli, $id, $input);
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
    $regionId = $input['regionId'] ?: null;
    $isFeatured = !empty($input['isFeatured']) ? 1 : 0;
    $featuredSortOrder = int_or_null($input, 'featuredSortOrder');
    $showInPromociones = !empty($input['showInPromociones']) ? 1 : 0;

    $stmt = $mysqli->prepare(
        'UPDATE packages SET
           slug=?, title=?, subtitle=?, content=?, duration_days=?, duration_nights=?,
           package_type=?, price_display_mode=?, price_from_clp=?, price_to_clp=?, price_unit=?,
           included=?, not_included=?, region_id=?, is_featured=?, featured_sort_order=?,
           show_in_promociones=?, status=?, updated_by=?
         WHERE id=?'
    );
    $stmt->bind_param(
        'ssssiissiissssiiisss',
        $input['slug'], $input['title'], $subtitle, $content, $durationDays, $durationNights,
        $input['packageType'], $input['priceDisplayMode'], $priceFromClp, $priceToClp, $input['priceUnit'],
        $included, $notIncluded, $regionId, $isFeatured, $featuredSortOrder,
        $showInPromociones, $input['status'], $user['id'], $id
    );
    if (!$stmt->execute()) {
        $stmt->close();
        if ($mysqli->errno === 1062) json_error('Ya existe un paquete con ese slug', 409);
        json_error('No se pudo actualizar el paquete', 500);
    }
    $stmt->close();
    replace_children($mysqli, $id, $input);
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

json_error('Ruta no encontrada', 404);
