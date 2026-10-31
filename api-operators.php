<?php
// Directorio de operadores y proveedores. Consulta para quien tenga 'operators:view';
// crear/editar solo con 'operators:edit'. La comisión solo se entrega con 'operators:commission'.
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
install_json_error_handlers();

$session = require_auth('operators:view');
$user = $session['user'];
$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'];
$mysqli = db();
$seesCommission = can($user, 'operators:commission');

function operator_json(array $r, bool $commission): array {
    return [
        'id' => (int) $r['id'], 'name' => $r['name'], 'country' => $r['country'], 'kind' => $r['kind'],
        'destinations' => $r['destinations_text'] ?? '', 'contactName' => $r['contact_name'], 'email' => $r['email'],
        'phone' => $r['phone'], 'notes' => $r['notes'], 'isActive' => (bool) $r['is_active'],
        'commissionPct' => $commission && $r['commission_pct'] !== null ? (float) $r['commission_pct'] : null,
    ];
}

if ($action === 'list' && $method === 'GET') {
    $where = [];
    $params = [];
    $types = '';
    if (($_GET['inactive'] ?? '') !== '1') $where[] = 'is_active = 1';
    if (($c = trim((string) ($_GET['country'] ?? ''))) !== '') { $where[] = 'country = ?'; $params[] = $c; $types .= 's'; }
    if (($k = trim((string) ($_GET['kind'] ?? ''))) !== '') { $where[] = 'kind = ?'; $params[] = $k; $types .= 's'; }
    if (($q = trim((string) ($_GET['q'] ?? ''))) !== '') {
        $where[] = '(name LIKE ? OR destinations_text LIKE ? OR contact_name LIKE ? OR email LIKE ? OR notes LIKE ?)';
        $like = "%$q%";
        array_push($params, $like, $like, $like, $like, $like);
        $types .= 'sssss';
    }
    $sql = 'SELECT * FROM operators' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY name';
    $stmt = $mysqli->prepare($sql);
    if ($types !== '') $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = operator_json($r, $seesCommission);
    $stmt->close();
    $countries = array_column($mysqli->query("SELECT DISTINCT country FROM operators WHERE country <> '' ORDER BY country")->fetch_all(MYSQLI_ASSOC), 'country');
    $kinds = array_column($mysqli->query("SELECT DISTINCT kind FROM operators WHERE kind <> '' ORDER BY kind")->fetch_all(MYSQLI_ASSOC), 'kind');
    json_ok(['operators' => $rows, 'countries' => $countries, 'kinds' => $kinds, 'canEdit' => can($user, 'operators:edit'), 'showCommission' => $seesCommission]);
}

// Escritura: solo 'operators:edit'.
require_auth('operators:edit');

function read_operator(array $in): array {
    $name = str_field($in, 'name');
    if ($name === '') json_error('El nombre es obligatorio', 400);
    $email = str_field($in, 'email');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Correo inválido', 400);
    $pct = $in['commissionPct'] ?? null;
    $pct = ($pct === null || $pct === '') ? null : (float) $pct;
    if ($pct !== null && ($pct < 0 || $pct > 100)) json_error('La comisión debe estar entre 0 y 100', 400);
    return [
        mb_substr($name, 0, 190), mb_substr(str_field($in, 'country'), 0, 100), mb_substr(str_field($in, 'kind'), 0, 60),
        mb_substr(str_field($in, 'destinations'), 0, 500) ?: null, $pct, mb_substr(str_field($in, 'contactName'), 0, 190) ?: null,
        $email ?: null, mb_substr(str_field($in, 'phone'), 0, 60) ?: null, mb_substr(str_field($in, 'notes'), 0, 4000) ?: null,
    ];
}

if ($action === 'create' && $method === 'POST') {
    $f = read_operator(json_body());
    $stmt = $mysqli->prepare('INSERT INTO operators (name, country, kind, destinations_text, commission_pct, contact_name, email, phone, notes) VALUES (?,?,?,?,?,?,?,?,?)');
    $stmt->bind_param('ssssdssss', ...$f);
    $stmt->execute();
    json_ok(['id' => $mysqli->insert_id]);
}

if ($action === 'update' && $method === 'POST') {
    $id = (int) ($_GET['id'] ?? 0);
    $in = json_body();
    $f = read_operator($in);
    $active = array_key_exists('isActive', $in) ? (int) !empty($in['isActive']) : 1;
    $stmt = $mysqli->prepare('UPDATE operators SET name=?, country=?, kind=?, destinations_text=?, commission_pct=?, contact_name=?, email=?, phone=?, notes=?, is_active=? WHERE id=?');
    $stmt->bind_param('ssssdssssii', ...[...$f, $active, $id]);
    $stmt->execute();
    json_ok([]);
}

json_error('Ruta no encontrada', 404);
