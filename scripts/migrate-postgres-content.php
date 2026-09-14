<?php
// Migra el contenido real (paquetes/addons/room_options/itinerario/páginas
// estáticas/blog) desde los CSV exportados de la Postgres vieja (quotes-db)
// hacia la MySQL nueva. Las imágenes NO se migran acá a propósito: los
// archivos reales se perdieron (rm -rf accidental) y los 62 registros de
// `images` eran solo fotos de stock, no contenido único del cliente — se
// re-suben más adelante desde el panel. Idempotente para packages/addons/
// room_options/itinerary/blog (usa DELETE+INSERT por slug si ya existe);
// static_pages usa UPSERT por slug para no perder ediciones ya hechas en
// MySQL si las hubiera.
//
// Uso: php scripts/migrate-postgres-content.php /ruta/a/pg-migration/
require_once __DIR__ . '/../inc/db.php';

$dir = rtrim($argv[1] ?? '', '/');
if ($dir === '' || !is_dir($dir)) {
    fwrite(STDERR, "Uso: php migrate-postgres-content.php <carpeta con los CSV>\n");
    exit(1);
}

function read_csv(string $path): array {
    $rows = [];
    $fh = fopen($path, 'r');
    $header = fgetcsv($fh);
    while (($line = fgetcsv($fh)) !== false) {
        if ($line === [null] || $line === false) continue;
        $rows[] = array_combine($header, $line);
    }
    fclose($fh);
    return $rows;
}

function nn(?string $v): ?string {
    return ($v === null || $v === '') ? null : $v;
}

function pg_bool(string $v): int {
    return $v === 't' ? 1 : 0;
}

function pg_timestamp_to_mysql(?string $v): ?string {
    if ($v === null || $v === '') return null;
    $ts = strtotime($v);
    return $ts !== false ? date('Y-m-d H:i:s', $ts) : null;
}

$mysqli = db();

// --- Mapa de regiones por slug (las regiones ya existen en MySQL, sembradas
// por schema.sql con sus propios UUID — no reusamos los IDs de Postgres). ---
$regionsBySlug = [];
$res = $mysqli->query('SELECT id, slug FROM regions');
while ($r = $res->fetch_assoc()) $regionsBySlug[$r['slug']] = $r['id'];

// --- Paquetes ---
$packages = read_csv("$dir/packages.csv");
$stmtPkg = $mysqli->prepare(
    'INSERT INTO packages (
        id, slug, title, subtitle, content, duration_days, duration_nights,
        package_type, price_display_mode, price_from_clp, price_to_clp, price_unit,
        included, not_included, region_id, is_featured, featured_sort_order,
        show_in_promociones, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
        title=VALUES(title), subtitle=VALUES(subtitle), content=VALUES(content),
        duration_days=VALUES(duration_days), duration_nights=VALUES(duration_nights),
        package_type=VALUES(package_type), price_display_mode=VALUES(price_display_mode),
        price_from_clp=VALUES(price_from_clp), price_to_clp=VALUES(price_to_clp),
        price_unit=VALUES(price_unit), included=VALUES(included), not_included=VALUES(not_included),
        region_id=VALUES(region_id), is_featured=VALUES(is_featured),
        featured_sort_order=VALUES(featured_sort_order), show_in_promociones=VALUES(show_in_promociones),
        status=VALUES(status)'
);

$packageIds = [];
foreach ($packages as $p) {
    $regionId = isset($regionsBySlug[$p['region_slug']]) ? $regionsBySlug[$p['region_slug']] : null;
    $durationDays = nn($p['duration_days']);
    $durationNights = nn($p['duration_nights']);
    $priceFrom = nn($p['price_from_clp']);
    $priceTo = nn($p['price_to_clp']);
    $isFeatured = pg_bool($p['is_featured']);
    $featuredSort = nn($p['featured_sort_order']);
    $showInPromos = pg_bool($p['show_in_promociones']);

    $stmtPkg->bind_param(
        'sssssiissiissssiiis',
        $p['id'], $p['slug'], $p['title'], $p['subtitle'], $p['content'],
        $durationDays, $durationNights, $p['package_type'], $p['price_display_mode'],
        $priceFrom, $priceTo, $p['price_unit'], $p['included'], $p['not_included'],
        $regionId, $isFeatured, $featuredSort, $showInPromos, $p['status']
    );
    $stmtPkg->execute();
    $packageIds[$p['id']] = true;
}
$stmtPkg->close();
echo "Paquetes migrados: " . count($packages) . "\n";

// --- Addons / habitaciones / itinerario (hijos de packages, mismo id de PG) ---
// $nullableColumns: columnas que sí deben pasar de '' a NULL (las numéricas
// opcionales). Las demás (texto NOT NULL con default '' en Postgres) se
// insertan tal cual, aunque vengan vacías.
function migrate_children(mysqli $mysqli, string $csvPath, string $table, array $columns, string $types, array $nullableColumns = []): int {
    $rows = read_csv($csvPath);
    if (count($rows) === 0) return 0;
    $placeholders = implode(',', array_fill(0, count($columns), '?'));
    $colList = implode(', ', $columns);
    $stmt = $mysqli->prepare("INSERT INTO $table ($colList) VALUES ($placeholders)");
    $n = 0;
    foreach ($rows as $row) {
        $values = [];
        foreach ($columns as $c) {
            $v = $row[$c] ?? null;
            $values[] = in_array($c, $nullableColumns, true) ? nn($v) : $v;
        }
        $stmt->bind_param($types, ...$values);
        $stmt->execute();
        $n++;
    }
    $stmt->close();
    return $n;
}

// Limpia hijos existentes de los paquetes migrados antes de reinsertar
// (evita duplicar si el script se corre dos veces).
if (count($packageIds) > 0) {
    $ids = implode(',', array_map(fn($id) => "'" . $mysqli->real_escape_string($id) . "'", array_keys($packageIds)));
    $mysqli->query("DELETE FROM package_addons WHERE package_id IN ($ids)");
    $mysqli->query("DELETE FROM package_room_options WHERE package_id IN ($ids)");
    $mysqli->query("DELETE FROM package_itinerary_days WHERE package_id IN ($ids)");
}

$nAddons = migrate_children($mysqli, "$dir/package_addons.csv", 'package_addons',
    ['id', 'package_id', 'name', 'price_clp', 'sort_order'], 'sssii');
echo "Addons migrados: $nAddons\n";

$nRooms = migrate_children($mysqli, "$dir/package_room_options.csv", 'package_room_options',
    ['id', 'package_id', 'label', 'price_adjustment_clp', 'sort_order'], 'sssii');
echo "Habitaciones migradas: $nRooms\n";

$nDays = migrate_children($mysqli, "$dir/package_itinerary_days.csv", 'package_itinerary_days',
    ['id', 'package_id', 'day_number', 'title', 'description', 'sort_order'], 'ssissi', ['day_number']);
echo "Días de itinerario migrados: $nDays\n";

// --- Páginas estáticas (upsert por slug — no pisa el id si ya existía) ---
$pages = read_csv("$dir/static_pages.csv");
$stmtPage = $mysqli->prepare(
    'INSERT INTO static_pages (id, slug, title, content) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title=VALUES(title), content=VALUES(content)'
);
foreach ($pages as $pg) {
    $stmtPage->bind_param('ssss', $pg['id'], $pg['slug'], $pg['title'], $pg['content']);
    $stmtPage->execute();
}
$stmtPage->close();
echo "Páginas estáticas migradas: " . count($pages) . "\n";

// --- Blog ---
$posts = read_csv("$dir/blog_posts.csv");
$stmtPost = $mysqli->prepare(
    'INSERT INTO blog_posts (id, slug, title, excerpt, content, status, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title=VALUES(title), excerpt=VALUES(excerpt), content=VALUES(content),
        status=VALUES(status), published_at=VALUES(published_at)'
);
foreach ($posts as $post) {
    $publishedAt = pg_timestamp_to_mysql($post['published_at']);
    $stmtPost->bind_param('sssssss', $post['id'], $post['slug'], $post['title'], $post['excerpt'], $post['content'], $post['status'], $publishedAt);
    $stmtPost->execute();
}
$stmtPost->close();
echo "Posts de blog migrados: " . count($posts) . "\n";

echo "Listo.\n";
