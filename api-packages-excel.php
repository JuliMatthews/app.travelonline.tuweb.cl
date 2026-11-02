<?php
// Excel para completar los programas: se descarga con lo que ya hay (lo que falta, resaltado) y se vuelve a subir.
//   GET  ?action=export          → .xlsx con 4 hojas (PROGRAMAS, ITINERARIO, OPCIONALES, HABITACIONES) + LEEME
//   POST ?action=import          → vista previa de lo que cambiaría (no escribe nada)
//   POST ?action=import&apply=1  → aplica los cambios
// Reglas: una celda vacía NUNCA borra lo que ya existe; un programa nuevo siempre queda en BORRADOR.
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
require_once __DIR__ . '/inc/xlsx.php';
require_once __DIR__ . '/inc/package_gaps.php';
install_json_error_handlers();

$session = require_auth('packages:edit');
$userId = $session['user']['id'];
$action = $_GET['action'] ?? '';
$mysqli = db();

if (!xlsx_available()) json_error('Este servidor no tiene la extensión para leer Excel (zip). Avisa a soporte.', 501);

const PX_TIPOS = ['Circuito' => 'circuito', 'Todo incluido' => 'todo_incluido', 'Combinado' => 'combinado', 'Promoción 2x1' => 'promocion_2x1'];
const PX_UNIDADES = ['Por persona' => 'per_person', 'Por pareja' => 'per_couple'];
const PX_ESTADOS = ['Borrador' => 'draft', 'Publicado' => 'published', 'Archivado' => 'archived'];

function px_norm(?string $s): string {
    $s = mb_strtolower(trim((string) $s), 'UTF-8');
    $s = strtr($s, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n']);
    return trim(preg_replace('/\s+/', ' ', $s));
}
function px_slug(string $t): string {
    $t = trim(preg_replace('/[^a-z0-9]+/', '-', px_norm($t)), '-');
    return mb_substr($t ?: 'programa', 0, 150);
}
function px_clean(string $t): string { // normaliza saltos de línea y espacios sobrantes (para comparar textos)
    $t = str_replace(["\r\n", "\r"], "\n", $t);
    return trim(preg_replace("/\n{3,}/", "\n\n", preg_replace('/[ \t]+\n/', "\n", $t)));
}
// HTML guardado → texto plano para que Carolina lo lea y lo edite sin etiquetas.
function px_plain(?string $html): string {
    $t = preg_replace('#<br\s*/?>|</p>|</li>|</div>#i', "\n", (string) $html);
    $t = html_entity_decode(strip_tags($t), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return px_clean($t);
}
// Texto plano del Excel → HTML seguro para el itinerario (que el sitio muestra como HTML).
function px_html(string $text): string {
    $lines = array_values(array_filter(array_map('trim', preg_split('/\R/', $text)), fn($l) => $l !== ''));
    if (count($lines) <= 1) return htmlspecialchars($lines[0] ?? '', ENT_QUOTES, 'UTF-8');
    return implode('', array_map(fn($l) => '<p>' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</p>', $lines));
}
function px_lines(?string $t): string { // lista "una línea por ítem": normaliza saltos y espacios
    $l = array_filter(array_map('trim', preg_split('/\R/', (string) $t)), fn($x) => $x !== '');
    return implode("\n", $l);
}
function px_int($v): ?int { // "1.234.500", "$ 2 090 000" → 1234500 ; vacío → null ; basura → false
    $v = trim((string) $v);
    if ($v === '') return null;
    $neg = str_starts_with($v, '-') || str_starts_with($v, '−');
    $d = preg_replace('/\D/', '', $v);
    if ($d === '' || !preg_match('/^[\d.\s,$\-−]+$/u', $v)) return false;
    return $neg ? -(int) $d : (int) $d;
}

function px_load_regions(mysqli $m): array { // nombre normalizado → [id, name]
    $out = [];
    $res = $m->query('SELECT id, name FROM regions ORDER BY sort_order');
    while ($r = $res->fetch_assoc()) $out[px_norm($r['name'])] = $r;
    return $out;
}

function px_load_packages(mysqli $m): array { // slug → fila + itin_days + region_name
    $res = $m->query('SELECT p.*, r.name AS region_name, (SELECT COUNT(*) FROM package_itinerary_days d WHERE d.package_id = p.id) AS itin_days
        FROM packages p LEFT JOIN regions r ON r.id = p.region_id ORDER BY r.sort_order, p.title');
    $out = [];
    while ($r = $res->fetch_assoc()) $out[$r['slug']] = $r;
    return $out;
}

function px_children(mysqli $m, string $table, string $cols, string $order): array { // package_id → filas
    $res = $m->query("SELECT package_id, $cols FROM $table ORDER BY package_id, $order");
    $out = [];
    while ($r = $res->fetch_assoc()) $out[$r['package_id']][] = $r;
    return $out;
}

// ───────────────────────── EXPORT ─────────────────────────
if ($action === 'export' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $regions = px_load_regions($mysqli);
    $pkgs = px_load_packages($mysqli);
    $itin = px_children($mysqli, 'package_itinerary_days', 'day_number, title, description', 'sort_order');
    $adds = px_children($mysqli, 'package_addons', 'name, price_clp', 'sort_order');
    $rooms = px_children($mysqli, 'package_room_options', 'label, price_adjustment_clp', 'sort_order');
    $miss = fn() => ['v' => '', 's' => XS_MISSING];
    $locked = fn($v) => ['v' => $v, 's' => XS_LOCKED];

    $leeme = [
        [['v' => 'Cómo completar los programas', 's' => XS_TITLE]],
        [['v' => 'Este archivo trae los programas que ya están en el sitio. Las celdas AMARILLAS son datos que faltan: complétalas con la información de tus proveedores y súbelo de nuevo al panel (Paquetes → Subir Excel completado). No necesitas saber nada técnico.', 's' => XS_NOTE]],
        [''],
        [['v' => 'REGLAS', 's' => XS_TITLE]],
        [['v' => '1. No cambies la columna ID de los programas que ya existen. Es lo que une cada fila con su programa.', 's' => XS_NOTE]],
        [['v' => '2. Una celda vacía NO borra nada: si no escribes algo, el dato actual se queda como está.', 's' => XS_NOTE]],
        [['v' => '3. Para agregar un programa nuevo, escribe una fila nueva al final de PROGRAMAS dejando el ID vacío. Nombre y Región son obligatorios. Quedará como BORRADOR: no se ve en el sitio hasta que alguien lo publique.', 's' => XS_NOTE]],
        [['v' => '4. Precio: solo el número en pesos chilenos (CLP), sin símbolos. Si el proveedor lo da en dólares y no sabes el valor en pesos, déjalo vacío y anótalo en "Notas / dudas". Si el precio es "a consultar", escribe: Consultar.', 's' => XS_NOTE]],
        [['v' => '5. Incluye / No incluye: una cosa por línea (dentro de la celda, Alt+Enter para saltar de línea).', 's' => XS_NOTE]],
        [['v' => '6. Descripción: 2 a 4 líneas que cuenten qué hace especial al viaje. Es el texto que ve el cliente al entrar al programa. Sin copiar y pegar el catálogo del proveedor completo.', 's' => XS_NOTE]],
        [['v' => '7. Las hojas ITINERARIO, OPCIONALES y HABITACIONES se llenan con una fila por día / por opcional / por variante. Si cambias el itinerario de un programa, reemplaza TODO el itinerario de ese programa, así que deja sus días completos. En un programa nuevo escribe en "ID programa" el mismo nombre del programa.', 's' => XS_NOTE]],
        [['v' => '8. Las fotos no van en el Excel: se agregan después desde el panel.', 's' => XS_NOTE]],
        [['v' => '9. Si algo no está claro en el documento del proveedor, no lo adivines: déjalo vacío y escribe la duda en "Notas / dudas".', 's' => XS_NOTE]],
    ];

    $head = ['ID (no cambiar)', 'Nombre', 'Subtítulo', 'Región', 'Tipo', 'Días', 'Noches', 'Precio desde (CLP)', 'Unidad de precio',
        'Descripción (2 a 4 líneas)', 'Incluye (una línea por cosa)', 'No incluye (una línea por cosa)', 'Estado', 'Qué falta (automático, no se importa)', 'Notas / dudas (no se importa)'];
    $rows = [$head];
    $tipoInv = array_flip(PX_TIPOS); $unidadInv = array_flip(PX_UNIDADES); $estadoInv = array_flip(PX_ESTADOS);
    foreach ($pkgs as $slug => $p) {
        $gaps = package_gaps($p);
        $faltan = implode(', ', array_map(fn($g) => PACKAGE_GAP_LABELS[$g], $gaps));
        $plainContent = px_plain($p['content']);
        $hasPrice = $p['price_display_mode'] === 'desde' && (int) $p['price_from_clp'] > 0;
        $rows[] = [
            $locked($slug), $p['title'], $p['subtitle'] ?? '', $p['region_name'] ?? '', $tipoInv[$p['package_type']] ?? '',
            $p['duration_days'] !== null ? (int) $p['duration_days'] : $miss(),
            $p['duration_nights'] !== null ? (int) $p['duration_nights'] : $miss(),
            $hasPrice ? (int) $p['price_from_clp'] : ($p['price_display_mode'] === 'bajo_consulta' ? ['v' => 'Consultar', 's' => XS_MISSING] : $miss()),
            $unidadInv[$p['price_unit']] ?? '',
            mb_strlen($plainContent) >= 40 ? $plainContent : ($plainContent !== '' ? ['v' => $plainContent, 's' => XS_MISSING] : $miss()),
            trim((string) $p['included']) !== '' ? px_lines($p['included']) : $miss(),
            trim((string) $p['not_included']) !== '' ? px_lines($p['not_included']) : $miss(),
            $estadoInv[$p['status']] ?? '',
            $locked($faltan === '' ? 'Completo' : $faltan), '',
        ];
    }
    $sheetItin = [['ID programa', 'Programa (para que te ubiques)', 'Día', 'Título del día', 'Descripción del día']];
    $sheetAdd = [['ID programa', 'Programa (para que te ubiques)', 'Nombre del opcional', 'Precio (CLP)']];
    $sheetRoom = [['ID programa', 'Programa (para que te ubiques)', 'Variante (habitación o salida)', 'Diferencia de precio (CLP, negativo si baja)']];
    foreach ($pkgs as $slug => $p) {
        foreach ($itin[$p['id']] ?? [] as $d) $sheetItin[] = [$locked($slug), $locked($p['title']), $d['day_number'] !== null ? (int) $d['day_number'] : '', $d['title'], px_plain($d['description'])];
        foreach ($adds[$p['id']] ?? [] as $a) $sheetAdd[] = [$locked($slug), $locked($p['title']), $a['name'], (int) $a['price_clp']];
        foreach ($rooms[$p['id']] ?? [] as $r) $sheetRoom[] = [$locked($slug), $locked($p['title']), $r['label'], (int) $r['price_adjustment_clp']];
    }

    $bin = xlsx_build([
        ['name' => 'LEEME', 'widths' => [110], 'rows' => $leeme],
        ['name' => 'PROGRAMAS', 'header' => true, 'freeze' => true, 'rows' => $rows,
         'widths' => [24, 34, 30, 16, 16, 7, 8, 16, 14, 52, 42, 38, 12, 34, 30],
         'lists' => [['col' => 3, 'values' => array_values(array_map(fn($r) => $r['name'], $regions))], ['col' => 4, 'values' => array_keys(PX_TIPOS)],
                     ['col' => 8, 'values' => array_keys(PX_UNIDADES)], ['col' => 12, 'values' => array_keys(PX_ESTADOS)]]],
        ['name' => 'ITINERARIO', 'header' => true, 'freeze' => true, 'rows' => $sheetItin, 'widths' => [24, 34, 6, 38, 90]],
        ['name' => 'OPCIONALES', 'header' => true, 'freeze' => true, 'rows' => $sheetAdd, 'widths' => [24, 34, 46, 16]],
        ['name' => 'HABITACIONES', 'header' => true, 'freeze' => true, 'rows' => $sheetRoom, 'widths' => [24, 34, 46, 22]],
    ]);
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment; filename="programas-travelonline-' . date('Ymd') . '.xlsx"');
    header('Content-Length: ' . strlen($bin));
    echo $bin;
    exit;
}

// ───────────────────────── IMPORT ─────────────────────────
// Convierte una hoja en filas asociativas usando los títulos de la fila 1 (tolera columnas movidas o con texto extra).
function px_sheet_rows(array $sheets, string $name, array $keys): ?array {
    $found = null;
    foreach ($sheets as $n => $rows) if (px_norm($n) === px_norm($name)) $found = $rows;
    if ($found === null || !$found) return null;
    ksort($found);
    $first = reset($found);
    $map = [];
    foreach ($first as $ci => $title) {
        $t = px_norm($title);
        foreach ($keys as $k => $prefix) if (!isset($map[$k]) && str_starts_with($t, $prefix)) { $map[$k] = $ci; break; }
    }
    $out = [];
    foreach ($found as $rn => $line) {
        if ($rn === array_key_first($found)) continue;
        $row = ['_row' => $rn];
        $any = false;
        foreach ($keys as $k => $_) {
            $v = isset($map[$k]) ? trim((string) ($line[$map[$k]] ?? '')) : '';
            $row[$k] = $v;
            if ($v !== '' && !in_array($k, ['ref'], true)) $any = true;
        }
        if ($any) $out[] = $row;
    }
    return $out;
}

if ($action === 'import' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $apply = ($_GET['apply'] ?? '') === '1';
    $f = $_FILES['file'] ?? null;
    if (!$f || $f['error'] !== UPLOAD_ERR_OK) json_error('No llegó el archivo. Elige el Excel e inténtalo de nuevo.', 400);
    if ($f['size'] > 8 * 1024 * 1024) json_error('El archivo es muy grande (máximo 8 MB).', 400);
    try { $sheets = xlsx_read($f['tmp_name']); } catch (RuntimeException $e) { json_error($e->getMessage(), 400); }

    $progRows = px_sheet_rows($sheets, 'PROGRAMAS', ['id' => 'id', 'name' => 'nombre', 'subtitle' => 'subtitulo', 'region' => 'region', 'tipo' => 'tipo',
        'dias' => 'dias', 'noches' => 'noches', 'precio' => 'precio', 'unidad' => 'unidad', 'desc' => 'descripcion', 'inc' => 'incluye', 'exc' => 'no incluye', 'estado' => 'estado']);
    if ($progRows === null) json_error('No encontré la hoja PROGRAMAS. Usa el Excel que se descarga desde el panel.', 400);
    if (count($progRows) > 500) json_error('Demasiadas filas (máximo 500 programas por archivo).', 400);
    $itinRows = px_sheet_rows($sheets, 'ITINERARIO', ['key' => 'id', 'ref' => 'programa', 'day' => 'dia', 'title' => 'titulo', 'desc' => 'descripcion']) ?? [];
    $addRows = px_sheet_rows($sheets, 'OPCIONALES', ['key' => 'id', 'ref' => 'programa', 'name' => 'nombre', 'price' => 'precio']) ?? [];
    $roomRows = px_sheet_rows($sheets, 'HABITACIONES', ['key' => 'id', 'ref' => 'programa', 'label' => 'variante', 'adj' => 'diferencia']) ?? [];

    $regions = px_load_regions($mysqli);
    $pkgs = px_load_packages($mysqli);
    $itinDb = px_children($mysqli, 'package_itinerary_days', 'day_number, title, description', 'sort_order');
    $addDb = px_children($mysqli, 'package_addons', 'name, price_clp', 'sort_order');
    $roomDb = px_children($mysqli, 'package_room_options', 'label, price_adjustment_clp', 'sort_order');
    $takenSlugs = array_keys($pkgs);
    $titleToSlug = [];
    foreach ($pkgs as $sl => $pp) $titleToSlug[px_slug($pp['title'])] ??= $sl;

    $entries = [];   // clave → entrada del reporte
    $slugIndex = []; $nameIndex = []; // para enlazar las otras hojas: por ID (slug) y, si no, por nombre
    $seenIds = [];
    foreach ($progRows as $r) {
        $e = ['row' => $r['_row'], 'name' => $r['name'], 'action' => 'same', 'changes' => [], 'errors' => [], 'set' => [], 'new' => false, 'slug' => null, 'children' => []];
        $existing = null;
        if ($r['id'] !== '') {
            $existing = $pkgs[$r['id']] ?? $pkgs[px_slug($r['id'])] ?? null;
            if (!$existing) $e['errors'][] = "El ID \"{$r['id']}\" no existe. No lo cambies; para un programa nuevo deja el ID vacío.";
            elseif (isset($seenIds[$existing['slug']])) $e['errors'][] = 'Este programa aparece dos veces en el archivo.';
            else $seenIds[$existing['slug']] = true;
        } elseif ($r['name'] !== '' && isset($titleToSlug[px_slug($r['name'])]) && !isset($seenIds[$titleToSlug[px_slug($r['name'])]])) {
            // Sin ID pero con el mismo nombre de un programa que ya existe: es ese programa (evita duplicados si se sube dos veces).
            $existing = $pkgs[$titleToSlug[px_slug($r['name'])]];
            $seenIds[$existing['slug']] = true;
        } else {
            $e['new'] = true;
            if ($r['name'] === '') $e['errors'][] = 'Falta el nombre (para un programa nuevo es obligatorio).';
        }
        $e['name'] = $existing['title'] ?? $r['name'];
        $cur = $existing ?? ['title' => '', 'subtitle' => '', 'region_name' => '', 'package_type' => null, 'duration_days' => null, 'duration_nights' => null,
            'price_display_mode' => null, 'price_from_clp' => null, 'price_unit' => null, 'content' => '', 'included' => '', 'not_included' => '', 'status' => null];
        $set = [];
        $add = function (string $label, string $col, $val, $curVal) use (&$set, &$e) {
            if ((string) $val !== (string) $curVal) { $set[$col] = $val; $e['changes'][] = $label; }
        };

        if ($r['name'] !== '') {
            if (mb_strlen($r['name']) > 255) $e['errors'][] = 'El nombre es demasiado largo.';
            else $add('nombre', 'title', $r['name'], $cur['title']);
        }
        if ($r['subtitle'] !== '') {
            if (mb_strlen($r['subtitle']) > 255) $e['errors'][] = 'El subtítulo es demasiado largo (máx. 255).';
            else $add('subtítulo', 'subtitle', $r['subtitle'], $cur['subtitle']);
        }
        if ($r['region'] !== '') {
            $reg = $regions[px_norm($r['region'])] ?? null;
            if (!$reg) $e['errors'][] = "Región \"{$r['region']}\" no válida. Elige una de la lista (" . implode(', ', array_map(fn($x) => $x['name'], $regions)) . ').';
            else $add('región', 'region_id', $reg['id'], $existing['region_id'] ?? '');
        } elseif ($e['new']) $e['errors'][] = 'Falta la región (obligatoria en un programa nuevo).';
        if ($r['tipo'] !== '') {
            $tv = null;
            foreach (PX_TIPOS as $lab => $val) if (px_norm($lab) === px_norm($r['tipo'])) $tv = $val;
            if (!$tv) $e['errors'][] = "Tipo \"{$r['tipo']}\" no válido. Opciones: " . implode(', ', array_keys(PX_TIPOS)) . '.';
            else $add('tipo', 'package_type', $tv, $cur['package_type']);
        }
        foreach ([['dias', 'duration_days', 'días', 1, 120], ['noches', 'duration_nights', 'noches', 0, 120]] as [$k, $col, $lab, $min, $max]) {
            if ($r[$k] === '') continue;
            $n = px_int($r[$k]);
            if ($n === false || $n < $min || $n > $max) $e['errors'][] = "Valor de $lab no válido (\"{$r[$k]}\"): debe ser un número entre $min y $max.";
            else $add($lab, $col, $n, $cur[$col]);
        }
        if ($r['precio'] !== '') {
            if (in_array(px_norm($r['precio']), ['consultar', 'a consultar', 'bajo consulta'], true)) {
                if ($cur['price_display_mode'] !== 'bajo_consulta') { $set['price_display_mode'] = 'bajo_consulta'; $set['price_from_clp'] = null; $e['changes'][] = 'precio (a consultar)'; }
            } else {
                $n = px_int($r['precio']);
                if ($n === false || $n <= 0 || $n > 100000000) $e['errors'][] = "Precio no válido (\"{$r['precio']}\"): escribe solo el número en pesos, o la palabra Consultar.";
                elseif ($cur['price_display_mode'] !== 'desde' || (int) $cur['price_from_clp'] !== $n) { $set['price_display_mode'] = 'desde'; $set['price_from_clp'] = $n; $e['changes'][] = 'precio'; }
            }
        }
        if ($r['unidad'] !== '') {
            $uv = null;
            foreach (PX_UNIDADES as $lab => $val) if (px_norm($lab) === px_norm($r['unidad'])) $uv = $val;
            if (!$uv) $e['errors'][] = "Unidad de precio \"{$r['unidad']}\" no válida. Opciones: " . implode(', ', array_keys(PX_UNIDADES)) . '.';
            else $add('unidad de precio', 'price_unit', $uv, $cur['price_unit']);
        }
        if ($r['desc'] !== '') {
            $d = px_clean($r['desc']);
            if (mb_strlen($d) > 8000) $e['errors'][] = 'La descripción es muy larga (máx. 8000 caracteres).';
            else $add('descripción', 'content', px_clean($d), px_plain($cur['content']));
        }
        foreach ([['inc', 'included', 'qué incluye'], ['exc', 'not_included', 'qué no incluye']] as [$k, $col, $lab]) {
            if ($r[$k] === '') continue;
            $v = px_lines($r[$k]);
            if (mb_strlen($v) > 8000) $e['errors'][] = "\"$lab\" es muy largo (máx. 8000 caracteres).";
            else $add($lab, $col, $v, px_lines($cur[$col]));
        }
        if ($r['estado'] !== '' && !$e['new']) {
            $sv = null;
            foreach (PX_ESTADOS as $lab => $val) if (px_norm($lab) === px_norm($r['estado'])) $sv = $val;
            if (!$sv) $e['errors'][] = "Estado \"{$r['estado']}\" no válido. Opciones: " . implode(', ', array_keys(PX_ESTADOS)) . '.';
            else $add('estado', 'status', $sv, $cur['status']);
        }
        if ($e['new']) {
            $base = px_slug($r['name'] ?: 'programa');
            $slug = $base;
            for ($i = 2; in_array($slug, $takenSlugs, true); $i++) $slug = "$base-$i";
            $takenSlugs[] = $slug;
            $e['slug'] = $slug;
            $set += ['slug' => $slug, 'status' => 'draft'];
            if (!isset($set['package_type'])) $set['package_type'] = 'circuito';
            if (!isset($set['price_display_mode'])) { $set['price_display_mode'] = 'bajo_consulta'; }
            if (!isset($set['price_unit'])) $set['price_unit'] = 'per_person';
            $e['changes'] = ['programa nuevo (queda en borrador)'];
        } else {
            $e['slug'] = $existing['slug'] ?? null;
        }
        $e['set'] = $set;
        $e['pkg'] = $existing;
        $key = $e['slug'] ?? ('fila' . $r['_row']);
        $entries[$key] = $e;
        if ($existing) { $slugIndex[px_slug($existing['slug'])] = $key; $nameIndex[px_slug($existing['title'])] ??= $key; }
        if ($e['new'] && $r['name'] !== '') $nameIndex[px_slug($r['name'])] ??= $key;
    }

    $orphans = []; // filas de otras hojas que no encontraron su programa
    $group = function (array $rows, string $sheet) use (&$slugIndex, &$nameIndex, &$orphans) {
        $g = [];
        foreach ($rows as $r) {
            $k = $slugIndex[px_slug($r['key'])] ?? $nameIndex[px_slug($r['key'])] ?? null;
            if ($k === null) { $orphans[] = ['sheet' => $sheet, 'row' => $r['_row'], 'msg' => "No encontré el programa \"{$r['key']}\"."]; continue; }
            $g[$k][] = $r;
        }
        return $g;
    };

    // Itinerario / opcionales / habitaciones: solo reemplazan si el programa trae filas Y son distintas a lo que hay.
    $childPlans = [];
    foreach ($group($itinRows, 'ITINERARIO') as $k => $rows) {
        $new = []; $i = 0;
        foreach ($rows as $r) {
            $i++;
            $day = px_int($r['day']);
            if ($r['title'] === '' && $r['desc'] === '') continue;
            if ($day === false) { $entries[$k]['errors'][] = "Itinerario, fila {$r['_row']}: el día debe ser un número."; continue; }
            if (mb_strlen($r['title']) > 255) { $entries[$k]['errors'][] = "Itinerario, fila {$r['_row']}: el título del día es muy largo."; continue; }
            $new[] = ['day' => $day, 'title' => $r['title'], 'desc' => px_clean($r['desc'])];
        }
        $cur = array_map(fn($d) => ['day' => $d['day_number'] !== null ? (int) $d['day_number'] : null, 'title' => trim($d['title']), 'desc' => px_plain($d['description'])],
            $entries[$k]['pkg'] ? ($itinDb[$entries[$k]['pkg']['id']] ?? []) : []);
        if ($new && $new != $cur) { $childPlans[$k]['itin'] = $new; $entries[$k]['changes'][] = 'itinerario (' . count($new) . ' días' . ($entries[$k]['pkg'] ? ', reemplaza el actual' : '') . ')'; }
    }
    foreach ($group($addRows, 'OPCIONALES') as $k => $rows) {
        $new = [];
        foreach ($rows as $r) {
            if ($r['name'] === '') continue;
            $p = $r['price'] === '' ? 0 : px_int($r['price']);
            if ($p === false || $p < 0) { $entries[$k]['errors'][] = "Opcionales, fila {$r['_row']}: precio no válido."; continue; }
            $new[] = ['name' => mb_substr($r['name'], 0, 255), 'price' => $p];
        }
        $cur = array_map(fn($a) => ['name' => $a['name'], 'price' => (int) $a['price_clp']], $entries[$k]['pkg'] ? ($addDb[$entries[$k]['pkg']['id']] ?? []) : []);
        if ($new && $new != $cur) { $childPlans[$k]['add'] = $new; $entries[$k]['changes'][] = 'opcionales (' . count($new) . ')'; }
    }
    foreach ($group($roomRows, 'HABITACIONES') as $k => $rows) {
        $new = [];
        foreach ($rows as $r) {
            if ($r['label'] === '') continue;
            $p = $r['adj'] === '' ? 0 : px_int($r['adj']);
            if ($p === false) { $entries[$k]['errors'][] = "Habitaciones, fila {$r['_row']}: la diferencia de precio no es válida."; continue; }
            $new[] = ['label' => mb_substr($r['label'], 0, 255), 'adj' => $p];
        }
        $cur = array_map(fn($a) => ['label' => $a['label'], 'adj' => (int) $a['price_adjustment_clp']], $entries[$k]['pkg'] ? ($roomDb[$entries[$k]['pkg']['id']] ?? []) : []);
        if ($new && $new != $cur) { $childPlans[$k]['room'] = $new; $entries[$k]['changes'][] = 'habitaciones (' . count($new) . ')'; }
    }

    $counts = ['create' => 0, 'update' => 0, 'same' => 0, 'error' => 0];
    foreach ($entries as $k => &$e) {
        if ($e['errors']) { $e['action'] = 'error'; $e['changes'] = []; }
        elseif ($e['new']) $e['action'] = 'create';
        elseif ($e['changes']) $e['action'] = 'update';
        else $e['action'] = 'same';
        $counts[$e['action']]++;
    }
    unset($e);

    if ($apply) {
        $mysqli->begin_transaction();
        try {
            foreach ($entries as $k => $e) {
                if ($e['action'] !== 'create' && $e['action'] !== 'update') continue;
                $set = $e['set'];
                if ($e['action'] === 'create') {
                    $pid = new_uuid();
                    $set['id'] = $pid;
                    $set['created_by'] = $userId; $set['updated_by'] = $userId;
                    $cols = array_keys($set);
                    $s = $mysqli->prepare('INSERT INTO packages (' . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')');
                    $vals = array_values($set);
                    $s->bind_param(str_repeat('s', count($vals)), ...$vals);
                    $s->execute();
                    $s->close();
                } else {
                    $pid = $e['pkg']['id'];
                    if ($set) {
                        $set['updated_by'] = $userId;
                        $assign = implode(', ', array_map(fn($c) => "$c = ?", array_keys($set)));
                        $s = $mysqli->prepare("UPDATE packages SET $assign WHERE id = ?");
                        $vals = array_values($set);
                        $vals[] = $pid;
                        $s->bind_param(str_repeat('s', count($vals)), ...$vals);
                        $s->execute();
                        $s->close();
                    }
                }
                $cp = $childPlans[$k] ?? [];
                if (isset($cp['itin'])) {
                    $d = $mysqli->prepare('DELETE FROM package_itinerary_days WHERE package_id = ?'); $d->bind_param('s', $pid); $d->execute(); $d->close();
                    foreach ($cp['itin'] as $i => $day) {
                        $id = new_uuid(); $html = px_html($day['desc']);
                        $s = $mysqli->prepare('INSERT INTO package_itinerary_days (id, package_id, day_number, title, description, sort_order) VALUES (?,?,?,?,?,?)');
                        $dn = $day['day'] ?? ($i + 1);
                        $s->bind_param('ssissi', $id, $pid, $dn, $day['title'], $html, $i); $s->execute(); $s->close();
                    }
                }
                if (isset($cp['add'])) {
                    $d = $mysqli->prepare('DELETE FROM package_addons WHERE package_id = ?'); $d->bind_param('s', $pid); $d->execute(); $d->close();
                    foreach ($cp['add'] as $i => $a) {
                        $id = new_uuid();
                        $s = $mysqli->prepare('INSERT INTO package_addons (id, package_id, name, price_clp, sort_order) VALUES (?,?,?,?,?)');
                        $s->bind_param('sssii', $id, $pid, $a['name'], $a['price'], $i); $s->execute(); $s->close();
                    }
                }
                if (isset($cp['room'])) {
                    $d = $mysqli->prepare('DELETE FROM package_room_options WHERE package_id = ?'); $d->bind_param('s', $pid); $d->execute(); $d->close();
                    foreach ($cp['room'] as $i => $a) {
                        $id = new_uuid();
                        $s = $mysqli->prepare('INSERT INTO package_room_options (id, package_id, label, price_adjustment_clp, sort_order) VALUES (?,?,?,?,?)');
                        $s->bind_param('sssii', $id, $pid, $a['label'], $a['adj'], $i); $s->execute(); $s->close();
                    }
                }
            }
            $mysqli->commit();
        } catch (Throwable $ex) {
            $mysqli->rollback();
            error_log('[PACKAGES_IMPORT] ' . $ex->getMessage());
            json_error('No se pudo aplicar el archivo; no se cambió nada. Inténtalo de nuevo o avisa a soporte.', 500);
        }
    }

    $report = [];
    foreach ($entries as $e) {
        if ($e['action'] === 'same') continue;
        $report[] = ['row' => $e['row'], 'name' => $e['name'], 'action' => $e['action'], 'changes' => $e['changes'], 'errors' => $e['errors']];
    }
    json_ok(['applied' => $apply, 'counts' => $counts, 'rows' => $report, 'orphans' => $orphans]);
}

json_error('Ruta no encontrada', 404);
