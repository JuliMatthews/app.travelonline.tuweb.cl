<?php
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Solo se ejecuta desde la terminal.'); }
// Rellena, desde las "Notas internas" que dejó la carga de proveedores, los campos estructurados nuevos:
// proveedor, precio original en USD, vigencia de tarifa, regla de salidas y salidas con fecha.
// Solo copia lo que el PDF dice; lo dudoso se omite y queda en el informe. Se puede repetir sin duplicar.
// Uso: php scripts/backfill-precios-salidas.php [--dry]
require_once __DIR__ . '/../inc/db.php';
$dry = in_array('--dry', $argv, true);
$db = db();

const MESES = ['ene' => 1, 'feb' => 2, 'mar' => 3, 'abr' => 4, 'may' => 5, 'jun' => 6, 'jul' => 7, 'ago' => 8, 'sep' => 9, 'oct' => 10, 'nov' => 11, 'dic' => 12];
const MESES_LARGOS = ['enero' => 1, 'febrero' => 2, 'marzo' => 3, 'abril' => 4, 'mayo' => 5, 'junio' => 6, 'julio' => 7, 'agosto' => 8, 'septiembre' => 9, 'octubre' => 10, 'noviembre' => 11, 'diciembre' => 12];

function operator_id(mysqli $db, string $name, string $kind, float $markup, bool $dry): ?int {
    $s = $db->prepare('SELECT id FROM operators WHERE name = ? AND is_demo = 0');
    $s->bind_param('s', $name); $s->execute();
    $r = $s->get_result()->fetch_assoc(); $s->close();
    if ($r) return (int) $r['id'];
    if ($dry) return -1;
    $s = $db->prepare('INSERT INTO operators (name, country, kind, markup_pct, is_active, is_demo) VALUES (?, "", ?, ?, 1, 0)');
    $s->bind_param('ssd', $name, $kind, $markup); $s->execute(); $id = $db->insert_id; $s->close();
    return $id;
}

/** "1.199" -> 1199.0 (el punto es separador de miles en los PDF). */
function usd(string $s): float { return (float) str_replace('.', '', $s); }

/** Lee "Mes d, d · Mes d..." con años explícitos ("Ene 2027: 2, 9"). Devuelve [fechas, aviso]. */
function parse_dates(string $text, int $baseYear): array {
    $year = $baseYear; $prev = 0; $out = []; $warn = [];
    if (!preg_match_all('/\b(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)\b(?:\s+(\d{4}))?\s*:?\s*((?:\d{1,2}\s*(?:,|y)?\s*)+)/u', $text, $m, PREG_SET_ORDER)) return [[], ''];
    foreach ($m as $x) {
        $mes = MESES[mb_strtolower($x[1])];
        if ($x[2] !== '') $year = (int) $x[2];
        elseif ($mes < $prev) { $year++; $warn[] = 'año supuesto'; }
        $prev = $mes;
        preg_match_all('/\d{1,2}/', $x[3], $d);
        foreach ($d[0] as $day) {
            $day = (int) $day;
            if ($day < 1 || $day > 31 || !checkdate($mes, $day, $year)) { return [[], 'fecha imposible']; }
            $out[] = sprintf('%04d-%02d-%02d', $year, $mes, $day);
        }
    }
    return [$out, implode(', ', array_unique($warn))];
}

/** Un grupo de fechas es creíble si cae en pocos días de la semana distintos (las salidas son semanales). */
function weekdays_ok(array $dates): bool {
    $w = [];
    foreach ($dates as $d) $w[(int) date('N', strtotime($d))] = 1;
    return count($w) <= 3;
}

$masEuropa = operator_id($db, 'Mas Europa', 'Mayorista', 0, $dry);
$china = operator_id($db, 'Fantástica China', 'Mayorista', 20, $dry);

$res = $db->query("SELECT id, title, internal_notes FROM packages WHERE internal_notes IS NOT NULL AND internal_notes <> '' AND status = 'draft'");
$c = ['operador' => 0, 'usd' => 0, 'vigencia' => 0, 'regla' => 0, 'fechas' => 0, 'programas con fechas' => 0];
$omitidos = [];
while ($row = $res->fetch_assoc()) {
    $id = $row['id']; $n = str_replace('\n', "\n", $row['internal_notes']); $t = $row['title'];

    // Proveedor
    $op = null;
    if (str_contains($n, 'Fantástica China')) $op = $china;
    elseif (preg_match('/Proveedor:\s*Mas\s*europa/i', $n)) $op = $masEuropa;
    // Precio original USD ("desde" para Mas Europa; "Neto" para China)
    $usdv = null;
    if (preg_match('/Neto USD ([\d.]+)/u', $n, $m)) $usdv = usd($m[1]);
    elseif (preg_match('/«desde» USD ([\d.]+)/u', $n, $m)) $usdv = usd($m[1]);
    elseif (preg_match('/doble\/triple USD ([\d.]+)/u', $n, $m)) $usdv = usd($m[1]);
    // Vigencia: "confirmación inmediata del 24 mar 2025 al 19 mar 2026"
    $valid = null;
    if (preg_match('/Vigencia:[^\n]*?\bal (\d{1,2}) (ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\w* (\d{4})/iu', $n, $m)) {
        $valid = sprintf('%04d-%02d-%02d', $m[3], MESES[mb_strtolower($m[2])], $m[1]);
    }
    // Regla de salidas
    $regla = null;
    if (preg_match('/Salidas \(texto del PDF\):\s*([^\n]+?)\.?\s*(\n|$)/u', $n, $m)) $regla = trim($m[1]);
    elseif (preg_match('/Salidas 20\d\d\/\d\d:\s*([^\n.]+)/u', $n, $m)) $regla = trim($m[1]);
    elseif (preg_match('/(Salidas diarias garantizadas desde \d pax, con confirmación inmediata)/u', $n, $m)) $regla = trim($m[1]);
    if ($regla !== null) $regla = mb_substr(mb_strtoupper(mb_substr($regla, 0, 1)) . mb_substr($regla, 1), 0, 255);

    // Fechas con año: se leen las secciones "Salidas 2026…" hasta el siguiente bloque ("Hoteles previstos", "Notas del PDF"…)
    $deps = [];
    if (preg_match('/(Salidas 20\d\d.*?)(?:\nHoteles previstos|\nNotas del PDF|\nVigencia|\nPrecio|\nPRECIO|\nExcursiones|\nTemporadas|$)/su', $n, $sec)) {
        $bloque = $sec[1];
        $base = (int) substr($bloque, 8, 4);
        // Etiquetas de grupo: "Tarifa USD 1.980:" | "Rojo:" | "Rojo (se supone USD 3.915):"
        $re = '/(Tarifa USD ([\d.]+)|Rojo|Negro|Gris|Naranja|Azul|Verde|Amarillo|Morado|Turquesa|Dorado)(?:\s*\([^)]*\))?\s*:/u';
        preg_match_all($re, $bloque, $lab, PREG_OFFSET_CAPTURE | PREG_SET_ORDER);
        $grupos = [];
        $ini = 0; $tierAct = null; $precioAct = null;
        foreach ($lab as $l) {
            $grupos[] = [$tierAct, $precioAct, substr($bloque, $ini, $l[0][1] - $ini)];
            $tierAct = $l[1][0]; $precioAct = isset($l[2]) && $l[2][0] !== '' ? usd($l[2][0]) : null;
            $ini = $l[0][1] + strlen($l[0][0]);
        }
        $grupos[] = [$tierAct, $precioAct, substr($bloque, $ini)];
        foreach ($grupos as [$tier, $precio, $p]) {
            $p = preg_replace('/\(con asterisco.*?\)/su', '', $p);
            [$ds, $aviso] = parse_dates($p, $base);
            if (!$ds) continue;
            if (!weekdays_ok($ds)) { $omitidos[] = "$t · " . ($tier ?? 'sin etiqueta') . ": los días de la semana no cuadran, omitido"; continue; }
            foreach ($ds as $d) $deps[] = [$d, $tier, $precio];
        }
    }

    // Aplicar
    $cuentaOp = $op !== null;
    if ($op === -1) $op = null;
    if (!$dry) {
        $s = $db->prepare('UPDATE packages SET operator_id = COALESCE(operator_id, ?), price_usd = COALESCE(price_usd, ?), tariff_valid_until = COALESCE(tariff_valid_until, ?), departures_text = COALESCE(departures_text, ?) WHERE id = ?');
        $s->bind_param('idsss', $op, $usdv, $valid, $regla, $id); $s->execute(); $s->close();
        if ($deps) { $s = $db->prepare('DELETE FROM package_departures WHERE package_id = ?'); $s->bind_param('s', $id); $s->execute(); $s->close(); }
        foreach ($deps as [$d, $tier, $precio]) {
            $s = $db->prepare('INSERT IGNORE INTO package_departures (package_id, departs_on, tier, price_usd) VALUES (?, ?, ?, ?)');
            $s->bind_param('sssd', $id, $d, $tier, $precio); $s->execute(); $s->close();
        }
    }
    $c['operador'] += $cuentaOp ? 1 : 0; $c['usd'] += $usdv !== null ? 1 : 0; $c['vigencia'] += $valid ? 1 : 0; $c['regla'] += $regla ? 1 : 0;
    $c['fechas'] += count($deps); $c['programas con fechas'] += $deps ? 1 : 0;
}
echo ($dry ? "[SIMULACIÓN] " : '') . "Programas con proveedor: {$c['operador']} · con precio USD: {$c['usd']} · con vigencia: {$c['vigencia']} · con regla de salidas: {$c['regla']} · fechas: {$c['fechas']} en {$c['programas con fechas']} programas\n";
foreach ($omitidos as $o) echo "  omitido: $o\n";
