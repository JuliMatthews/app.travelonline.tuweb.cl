<?php
// Sube las fotos reales curadas (una por paquete + 3 para Nosotros) al
// almacenamiento de admin/ y las enlaza en MySQL (images/package_images/
// static_page_images), reemplazando los <img> muertos de localhost:8090
// que quedaron incrustados en el contenido de Nosotros desde WordPress.
//
// Uso: php scripts/seed-package-images.php <carpeta con <slug>.jpg> <carpeta con las 3 de nosotros>
require_once __DIR__ . '/../inc/db.php';

$packagePhotosDir = rtrim($argv[1] ?? '', '/');
$nosotrosPhotosDir = rtrim($argv[2] ?? '', '/');
if ($packagePhotosDir === '' || !is_dir($packagePhotosDir)) {
    fwrite(STDERR, "Uso: php seed-package-images.php <carpeta fotos paquetes> <carpeta fotos nosotros>\n");
    exit(1);
}

$uploadDir = __DIR__ . '/../uploads';
$mysqli = db();

function insert_image(mysqli $mysqli, string $srcFile, string $uploadDir): array {
    $ext = strtolower(pathinfo($srcFile, PATHINFO_EXTENSION));
    $id = new_uuid();
    $destFile = "$uploadDir/$id.$ext";
    copy($srcFile, $destFile);

    $size = filesize($destFile);

    $stmt = $mysqli->prepare(
        'INSERT INTO images (id, file_extension, original_filename, mime_type, size_bytes)
         VALUES (?, ?, ?, ?, ?)'
    );
    $mime = 'image/jpeg';
    $origName = basename($srcFile);
    $stmt->bind_param('ssssi', $id, $ext, $origName, $mime, $size);
    $stmt->execute();
    $stmt->close();

    return ['id' => $id, 'ext' => $ext];
}

// --- Fotos de paquetes ---
$res = $mysqli->query('SELECT id, slug FROM packages');
$packages = [];
while ($r = $res->fetch_assoc()) $packages[$r['slug']] = $r['id'];

$n = 0;
$missing = [];
foreach ($packages as $slug => $packageId) {
    $file = "$packagePhotosDir/$slug.jpg";
    if (!is_file($file)) { $missing[] = $slug; continue; }

    $mysqli->query("DELETE pi FROM package_images pi WHERE pi.package_id = '" . $mysqli->real_escape_string($packageId) . "'");

    $img = insert_image($mysqli, $file, $uploadDir);
    $stmt = $mysqli->prepare('INSERT INTO package_images (package_id, image_id, sort_order) VALUES (?, ?, 0)');
    $stmt->bind_param('ss', $packageId, $img['id']);
    $stmt->execute();
    $stmt->close();
    $n++;
}
echo "Fotos de paquetes vinculadas: $n\n";
if (count($missing) > 0) echo "Sin foto (no encontrada en la carpeta): " . implode(', ', $missing) . "\n";

// --- Fotos de Nosotros (heroGallery + reemplazo de <img> muertos en el contenido) ---
$stmt = $mysqli->prepare('SELECT id, content FROM static_pages WHERE slug = ?');
$slugNosotros = 'nosotros';
$stmt->bind_param('s', $slugNosotros);
$stmt->execute();
$page = $stmt->get_result()->fetch_assoc();
$stmt->close();

if ($page) {
    $mysqli->query("DELETE FROM static_page_images WHERE page_id = '" . $mysqli->real_escape_string($page['id']) . "'");

    $hero1 = insert_image($mysqli, "$nosotrosPhotosDir/nosotros-hero-1.jpg", $uploadDir);
    $hero2 = insert_image($mysqli, "$nosotrosPhotosDir/nosotros-hero-2.jpg", $uploadDir);
    foreach ([$hero1, $hero2] as $i => $img) {
        $stmt = $mysqli->prepare('INSERT INTO static_page_images (page_id, image_id, sort_order) VALUES (?, ?, ?)');
        $stmt->bind_param('ssi', $page['id'], $img['id'], $i);
        $stmt->execute();
        $stmt->close();
    }
    echo "Fotos de portada de Nosotros: 2\n";

    // Las 4 figuras incrustadas en el texto reusan fotos ya subidas: mapa/llamada
    // (nuevas) y dubai/venecia (las mismas que ya quedaron como portada de
    // 'khalifa' y 'vaporetto' — no hace falta subirlas dos veces).
    $llamada = insert_image($mysqli, "$nosotrosPhotosDir/nosotros-llamada.jpg", $uploadDir);

    $stmt = $mysqli->prepare(
        "SELECT i.id, i.file_extension FROM packages p
         JOIN package_images pi ON pi.package_id = p.id
         JOIN images i ON i.id = pi.image_id
         WHERE p.slug = ?"
    );
    $khalifaSlug = 'khalifa';
    $stmt->bind_param('s', $khalifaSlug);
    $stmt->execute();
    $khalifaImg = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $vaporettoSlug = 'vaporetto';
    $stmt = $mysqli->prepare(
        "SELECT i.id, i.file_extension FROM packages p
         JOIN package_images pi ON pi.package_id = p.id
         JOIN images i ON i.id = pi.image_id
         WHERE p.slug = ?"
    );
    $stmt->bind_param('s', $vaporettoSlug);
    $stmt->execute();
    $vaporettoImg = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $urlFor = fn($img) => ADMIN_PUBLIC_URL . '/uploads/' . $img['id'] . '.' . $img['file_extension'];

    $content = $page['content'];
    $content = str_replace(
        'http://localhost:8090/wp-content/uploads/2026/09/18-mapa-1024x683.jpg',
        $urlFor(['id' => $hero1['id'], 'file_extension' => $hero1['ext']]),
        $content
    );
    $content = str_replace(
        'http://localhost:8090/wp-content/uploads/2026/09/19-llamada-1024x683.jpg',
        $urlFor(['id' => $llamada['id'], 'file_extension' => $llamada['ext']]),
        $content
    );
    if ($khalifaImg) {
        $content = str_replace(
            'http://localhost:8090/wp-content/uploads/2026/09/01-dubai-768x1024.jpg',
            $urlFor($khalifaImg),
            $content
        );
    }
    if ($vaporettoImg) {
        $content = str_replace(
            'http://localhost:8090/wp-content/uploads/2026/09/09-venecia-1024x768.jpg',
            $urlFor($vaporettoImg),
            $content
        );
    }

    $stmt = $mysqli->prepare('UPDATE static_pages SET content = ? WHERE id = ?');
    $stmt->bind_param('ss', $content, $page['id']);
    $stmt->execute();
    $stmt->close();
    echo "Contenido de Nosotros actualizado (4 imágenes incrustadas reemplazadas).\n";
} else {
    echo "No se encontró la página 'nosotros'.\n";
}

echo "Listo.\n";
