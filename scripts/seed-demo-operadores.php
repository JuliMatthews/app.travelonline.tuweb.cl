<?php
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Solo se ejecuta desde la terminal.'); }
// Operadores de EJEMPLO tomados de la maqueta de Francisco (datos ilustrativos, NO reales
// hasta que Carolina los confirme). Solo base LOCAL. Marcados is_demo=1.
// Uso: php scripts/seed-demo-operadores.php <operadores.json>   |   --clean
require_once __DIR__ . '/../inc/db.php';
if (!in_array(DB_HOST, ['127.0.0.1', 'localhost'], true)) { fwrite(STDERR, "Se niega a correr: DB_HOST no es local.\n"); exit(1); }
$m = db();
$m->query('DELETE FROM operators WHERE is_demo = 1');
if (in_array('--clean', $argv, true)) { echo "Operadores de ejemplo borrados\n"; exit(0); }
$file = $argv[1] ?? '';
$data = is_file($file) ? json_decode(file_get_contents($file), true) : null;
if (!is_array($data)) { fwrite(STDERR, "Uso: php scripts/seed-demo-operadores.php <operadores.json>\n"); exit(1); }
$s = $m->prepare('INSERT INTO operators (name, country, kind, destinations_text, commission_pct, contact_name, email, phone, notes, is_demo) VALUES (?,?,?,?,?,?,?,?,?,1)');
foreach ($data as $o) {
    $dest = implode(', ', $o['destinos'] ?? []);
    $s->bind_param('ssssdssss', $o['nombre'], $o['pais'], $o['tipo'], $dest, $o['comisionPct'], $o['contacto'], $o['email'], $o['telefono'], $o['notas']);
    $s->execute();
}
echo count($data) . " operadores de ejemplo creados\n";
