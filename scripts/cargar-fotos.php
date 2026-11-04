<?php
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Solo se ejecuta desde la terminal.'); }
// Carga una foto principal por programa SOLO a los que todavía no tienen ninguna.
// Uso: php scripts/cargar-fotos.php <carpeta con <id-del-programa>.jpg> [manifiesto.json]
// El manifiesto (opcional) es {"<id>": "texto"}: se agrega al final de las notas internas del programa
// (de dónde salió la foto), para no perder el rastro cuando haya que confirmar el permiso.
require_once __DIR__ . '/../inc/db.php';

$dir = rtrim($argv[1] ?? '', '/');
$manifestFile = $argv[2] ?? '';
if ($dir === '' || !is_dir($dir)) { fwrite(STDERR, "Uso: php scripts/cargar-fotos.php <carpeta> [manifiesto.json]\n"); exit(1); }
$manifest = $manifestFile && is_file($manifestFile) ? (json_decode(file_get_contents($manifestFile), true) ?: []) : [];

$uploadDir = realpath(__DIR__ . '/../uploads');
$mysqli = db();
$mysqli->begin_transaction();
$loaded = 0; $skipped = 0;

foreach (glob("$dir/*.jpg") as $file) {
    $pid = basename($file, '.jpg');
    $s = $mysqli->prepare('SELECT title, (SELECT COUNT(*) FROM package_images WHERE package_id = packages.id) AS n FROM packages WHERE id = ?');
    $s->bind_param('s', $pid); $s->execute();
    $row = $s->get_result()->fetch_assoc(); $s->close();
    if (!$row || (int) $row['n'] > 0) { $skipped++; continue; }

    $imgId = new_uuid();
    copy($file, "$uploadDir/$imgId.jpg");
    $size = filesize($file); $mime = 'image/jpeg'; $orig = $pid . '.jpg'; $alt = $row['title'];
    $st = $mysqli->prepare('INSERT INTO images (id, file_extension, original_filename, mime_type, size_bytes, alt_text) VALUES (?, "jpg", ?, ?, ?, ?)');
    $st->bind_param('sssis', $imgId, $orig, $mime, $size, $alt); $st->execute(); $st->close();
    $st = $mysqli->prepare('INSERT INTO package_images (package_id, image_id, sort_order) VALUES (?, ?, 0)');
    $st->bind_param('ss', $pid, $imgId); $st->execute(); $st->close();

    if (!empty($manifest[$pid])) {
        $note = "\n" . $manifest[$pid];
        $st = $mysqli->prepare('UPDATE packages SET internal_notes = CONCAT(COALESCE(internal_notes, ""), ?) WHERE id = ?');
        $st->bind_param('ss', $note, $pid); $st->execute(); $st->close();
    }
    $loaded++;
}
$mysqli->commit();
echo "Fotos cargadas: $loaded · omitidas (ya tenían foto o no existe el programa): $skipped\n";
