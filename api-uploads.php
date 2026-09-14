<?php
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
install_json_error_handlers();

require_auth('packages:edit');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Ruta no encontrada', 404);

$ALLOWED_MIME = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
$MAX_BYTES = 8 * 1024 * 1024;

if (empty($_FILES['file'])) json_error('Falta el archivo', 400);
$file = $_FILES['file'];

if ($file['error'] !== UPLOAD_ERR_OK) json_error('Error al subir el archivo', 400);
if ($file['size'] > $MAX_BYTES) json_error('El archivo supera el máximo de 8 MB', 400);

// No confiar en el mime que manda el navegador (Content-Type de $_FILES) —
// verificar el tipo real leyendo el archivo (finfo), a diferencia de
// send-application.php de HVAC que sí confía en eso. Acá vale la pena ser
// más estrictos porque las imágenes quedan públicas en el sitio.
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$realMime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if (!isset($ALLOWED_MIME[$realMime])) {
    json_error('Formato no soportado — usa JPG, PNG o WEBP', 400);
}
$extension = $ALLOWED_MIME[$realMime];

$session = current_session();
$id = new_uuid();

if (!is_dir(UPLOAD_DIR)) {
    mkdir(UPLOAD_DIR, 0755, true);
}
$destination = UPLOAD_DIR . '/' . $id . '.' . $extension;
if (!move_uploaded_file($file['tmp_name'], $destination)) {
    json_error('No se pudo guardar el archivo', 500);
}

$mysqli = db();
$stmt = $mysqli->prepare(
    'INSERT INTO images (id, file_extension, original_filename, mime_type, size_bytes, uploaded_by) VALUES (?,?,?,?,?,?)'
);
$originalName = $file['name'] ?: null;
$size = (int) $file['size'];
$uploadedBy = $session['user']['id'];
$stmt->bind_param('ssssis', $id, $extension, $originalName, $realMime, $size, $uploadedBy);
$stmt->execute();
$stmt->close();

json_ok(['id' => $id, 'extension' => $extension]);
