<?php
// Genera borradores EN/PT para el contenido real ya cargado (paquetes, blog,
// páginas) usando la API gratuita de MyMemory — mismo principio que
// web/scripts/translate-strings.php (ver ese archivo para más detalle de la
// API). Re-ejecutable y NO destructivo: solo traduce filas que todavía no
// tienen una traducción guardada (no pisa nada editado a mano en el panel,
// sea borrador de la API o ya revisado).
//
// ALCANCE DELIBERADO: solo campos de texto plano corto (título, subtítulo,
// incluye/no incluye línea por línea, nombres de excursión/habitación,
// extracto de blog). Los campos largos en HTML (contenido de paquete, de
// blog, de páginas estáticas, descripción de cada día de itinerario) NO se
// traducen automáticamente acá — partirlos a ciegas por caracteres para
// respetar el límite de la API gratuita puede cortar etiquetas HTML a la
// mitad. Esos quedan en español hasta que se arme un traductor consciente
// de HTML o se escriban a mano en el panel.
//
// Uso: php admin/scripts/translate-content.php [--force]

require_once __DIR__ . '/../inc/db.php';

$force = in_array('--force', $argv, true);

function mymemory_translate(string $text, string $target): string {
    $text = trim($text);
    if ($text === '') return '';
    if (mb_strlen($text) > 480) $text = mb_substr($text, 0, 480); // límite duro de la API gratuita
    $url = 'https://api.mymemory.translated.net/get?' . http_build_query(['q' => $text, 'langpair' => 'es|' . $target]);
    $ctx = stream_context_create(['http' => ['timeout' => 15]]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) return $text;
    $data = json_decode($raw, true);
    $translated = $data['responseData']['translatedText'] ?? null;
    if (!$translated || ($data['responseStatus'] ?? 200) != 200) return $text;
    usleep(150000);
    return html_entity_decode($translated, ENT_QUOTES, 'UTF-8');
}

// Traduce línea por línea (para campos tipo "incluye", una línea = un ítem,
// nunca se corta una etiqueta porque no hay etiquetas).
function translate_lines(string $text, string $target): string {
    if (trim($text) === '') return '';
    $lines = explode("\n", $text);
    $out = array_map(fn($l) => trim($l) === '' ? '' : mymemory_translate($l, $target), $lines);
    return implode("\n", $out);
}

$mysqli = db();
$targets = ['en', 'pt'];
$totalWritten = 0;

// --- Paquetes ---
$res = $mysqli->query("SELECT id, title, subtitle, included, not_included FROM packages WHERE status = 'published'");
while ($pkg = $res->fetch_assoc()) {
    foreach ($targets as $locale) {
        if (!$force) {
            $chk = $mysqli->prepare('SELECT 1 FROM package_translations WHERE package_id = ? AND locale = ?');
            $chk->bind_param('ss', $pkg['id'], $locale);
            $chk->execute();
            if ($chk->get_result()->fetch_row()) { $chk->close(); continue; }
            $chk->close();
        }
        echo "Paquete '{$pkg['title']}' -> $locale\n";
        $title = mymemory_translate($pkg['title'], $locale);
        $subtitle = $pkg['subtitle'] ? mymemory_translate($pkg['subtitle'], $locale) : null;
        $included = $pkg['included'] ? translate_lines($pkg['included'], $locale) : null;
        $notIncluded = $pkg['not_included'] ? translate_lines($pkg['not_included'], $locale) : null;

        $stmt = $mysqli->prepare(
            'INSERT INTO package_translations (package_id, locale, title, subtitle, included, not_included, is_machine_translated)
             VALUES (?, ?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE title = VALUES(title), subtitle = VALUES(subtitle), included = VALUES(included), not_included = VALUES(not_included)'
        );
        $stmt->bind_param('ssssss', $pkg['id'], $locale, $title, $subtitle, $included, $notIncluded);
        $stmt->execute();
        $stmt->close();
        $totalWritten++;
    }
}

// --- Itinerario (solo título del día, la descripción queda en español) ---
$res = $mysqli->query('SELECT id, title FROM package_itinerary_days');
while ($day = $res->fetch_assoc()) {
    if (trim($day['title']) === '') continue;
    foreach ($targets as $locale) {
        if (!$force) {
            $chk = $mysqli->prepare('SELECT 1 FROM package_itinerary_day_translations WHERE day_id = ? AND locale = ?');
            $chk->bind_param('ss', $day['id'], $locale);
            $chk->execute();
            if ($chk->get_result()->fetch_row()) { $chk->close(); continue; }
            $chk->close();
        }
        $title = mymemory_translate($day['title'], $locale);
        $stmt = $mysqli->prepare(
            'INSERT INTO package_itinerary_day_translations (day_id, locale, title, is_machine_translated)
             VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE title = VALUES(title)'
        );
        $stmt->bind_param('sss', $day['id'], $locale, $title);
        $stmt->execute();
        $stmt->close();
        $totalWritten++;
    }
}
echo "Itinerario: listo.\n";

// --- Excursiones (addons) ---
$res = $mysqli->query('SELECT id, name FROM package_addons');
while ($addon = $res->fetch_assoc()) {
    foreach ($targets as $locale) {
        if (!$force) {
            $chk = $mysqli->prepare('SELECT 1 FROM package_addon_translations WHERE addon_id = ? AND locale = ?');
            $chk->bind_param('ss', $addon['id'], $locale);
            $chk->execute();
            if ($chk->get_result()->fetch_row()) { $chk->close(); continue; }
            $chk->close();
        }
        $name = mymemory_translate($addon['name'], $locale);
        $stmt = $mysqli->prepare(
            'INSERT INTO package_addon_translations (addon_id, locale, name, is_machine_translated)
             VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE name = VALUES(name)'
        );
        $stmt->bind_param('sss', $addon['id'], $locale, $name);
        $stmt->execute();
        $stmt->close();
        $totalWritten++;
    }
}
echo "Excursiones: listo.\n";

// --- Opciones de habitación ---
$res = $mysqli->query('SELECT id, label FROM package_room_options');
while ($room = $res->fetch_assoc()) {
    foreach ($targets as $locale) {
        if (!$force) {
            $chk = $mysqli->prepare('SELECT 1 FROM package_room_option_translations WHERE room_option_id = ? AND locale = ?');
            $chk->bind_param('ss', $room['id'], $locale);
            $chk->execute();
            if ($chk->get_result()->fetch_row()) { $chk->close(); continue; }
            $chk->close();
        }
        $label = mymemory_translate($room['label'], $locale);
        $stmt = $mysqli->prepare(
            'INSERT INTO package_room_option_translations (room_option_id, locale, label, is_machine_translated)
             VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE label = VALUES(label)'
        );
        $stmt->bind_param('sss', $room['id'], $locale, $label);
        $stmt->execute();
        $stmt->close();
        $totalWritten++;
    }
}
echo "Opciones de habitación: listo.\n";

// --- Blog: solo título y extracto (el cuerpo del post queda en español) ---
$res = $mysqli->query("SELECT id, title, excerpt FROM blog_posts WHERE status = 'published'");
while ($post = $res->fetch_assoc()) {
    foreach ($targets as $locale) {
        if (!$force) {
            $chk = $mysqli->prepare('SELECT 1 FROM blog_post_translations WHERE post_id = ? AND locale = ?');
            $chk->bind_param('ss', $post['id'], $locale);
            $chk->execute();
            if ($chk->get_result()->fetch_row()) { $chk->close(); continue; }
            $chk->close();
        }
        $title = mymemory_translate($post['title'], $locale);
        $excerpt = mymemory_translate($post['excerpt'], $locale);
        $stmt = $mysqli->prepare(
            'INSERT INTO blog_post_translations (post_id, locale, title, excerpt, is_machine_translated)
             VALUES (?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE title = VALUES(title), excerpt = VALUES(excerpt)'
        );
        $stmt->bind_param('ssss', $post['id'], $locale, $title, $excerpt);
        $stmt->execute();
        $stmt->close();
        $totalWritten++;
    }
}
echo "Blog (título/extracto): listo.\n";

// --- Páginas estáticas: solo título (el cuerpo queda en español) ---
$res = $mysqli->query('SELECT id, title FROM static_pages');
while ($page = $res->fetch_assoc()) {
    foreach ($targets as $locale) {
        if (!$force) {
            $chk = $mysqli->prepare('SELECT 1 FROM static_page_translations WHERE page_id = ? AND locale = ?');
            $chk->bind_param('ss', $page['id'], $locale);
            $chk->execute();
            if ($chk->get_result()->fetch_row()) { $chk->close(); continue; }
            $chk->close();
        }
        $title = mymemory_translate($page['title'], $locale);
        $stmt = $mysqli->prepare(
            'INSERT INTO static_page_translations (page_id, locale, title, is_machine_translated)
             VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE title = VALUES(title)'
        );
        $stmt->bind_param('sss', $page['id'], $locale, $title);
        $stmt->execute();
        $stmt->close();
        $totalWritten++;
    }
}
echo "Páginas estáticas (título): listo.\n";

echo "\nTotal de filas de traducción escritas/actualizadas: $totalWritten\n";
