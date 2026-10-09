<?php
// Datos de EJEMPLO para el CRM — SOLO para la base LOCAL de desarrollo, para
// que el tablero y las solicitudes se vean con vida mientras se diseña.
// Cada fila queda marcada con details_json.demo = true, así se pueden borrar
// todas de una vez sin tocar las reales.
//
// Uso:
//   php scripts/seed-demo-crm.php          → crea ~42 solicitudes de ejemplo
//   php scripts/seed-demo-crm.php --clean  → borra solo las de ejemplo
//
// NUNCA correr contra producción: se niega si DB_HOST no es local.
require_once __DIR__ . '/../inc/db.php';

if (!in_array(DB_HOST, ['127.0.0.1', 'localhost'], true)) {
    fwrite(STDERR, "Se niega a correr: DB_HOST no es local (" . DB_HOST . ").\n");
    exit(1);
}

$mysqli = db();
$clean = in_array('--clean', $argv, true);

$mysqli->query("DELETE FROM quote_requests WHERE JSON_EXTRACT(details_json, '$.demo') = true");
echo "Solicitudes de ejemplo anteriores borradas: {$mysqli->affected_rows}\n";
if ($clean) exit(0);

// Responsables de ejemplo (usuarios locales). Clave aleatoria: no se usan para entrar.
function demo_user(mysqli $m, string $email, string $name): string {
    $s = $m->prepare('SELECT id FROM users WHERE email = ?');
    $s->bind_param('s', $email);
    $s->execute();
    $row = $s->get_result()->fetch_assoc();
    $s->close();
    if ($row) return $row['id'];
    $id = new_uuid();
    $hash = password_hash(bin2hex(random_bytes(12)), PASSWORD_BCRYPT);
    $role = 'editor';
    $s = $m->prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)');
    $s->bind_param('sssss', $id, $email, $hash, $name, $role);
    $s->execute();
    $s->close();
    return $id;
}
$carolina = demo_user($mysqli, 'carolina.demo@travelonline.local', 'Carolina');
$pia = demo_user($mysqli, 'pia.demo@travelonline.local', 'Pía');
$equipo = [$carolina, $carolina, $pia]; // Carolina lleva más carga

mt_srand(20261008); // mismos datos cada vez

$nombres = ['Josefa Riquelme', 'Benjamín González', 'Catalina Muñoz', 'Matías Rojas', 'Valentina Soto', 'Tomás Pérez',
    'Fernanda Silva', 'Joaquín Morales', 'Isidora Castro', 'Vicente Díaz', 'Antonia Fuentes', 'Martín Contreras',
    'Florencia Araya', 'Agustín Espinoza', 'Javiera Reyes', 'Sebastián Torres', 'Camila Herrera', 'Diego Núñez',
    'Paula Vargas', 'Ignacio Campos', 'Constanza Lagos', 'Felipe Sepúlveda', 'Daniela Orellana', 'Cristóbal Vera'];
$ciudades = ['Santiago', 'Viña del Mar', 'Concepción', 'La Serena', 'Temuco', 'Antofagasta', 'Rancagua', 'Puerto Montt'];
$destinos = ['Punta Cana', 'Cancún', 'Roma y Florencia', 'Madrid y París', 'Turquía', 'Dubái', 'Riviera Maya',
    'San Andrés', 'Grecia', 'Japón', 'Buzios', 'Las Vegas', 'Egipto', 'Cusco', 'Zanzíbar'];
$tipos = ['Vacaciones', 'Vacaciones', 'Familiar', 'Luna de miel', 'Grupo', 'Aventura', 'Crucero', 'Negocios'];
$canales = ['web', 'web', 'web', 'whatsapp', 'whatsapp', 'telefono', 'instagram', 'correo', 'referido'];
$rangos = [['Hasta $800.000', 700000], ['$800.000 – $1.500.000', 1150000], ['$1.500.000 – $2.500.000', 2000000],
    ['$2.500.000 – $4.000.000', 3200000], ['Más de $4.000.000', 4800000]];
$pick = fn(array $a) => $a[mt_rand(0, count($a) - 1)];

$insert = $mysqli->prepare(
    'INSERT INTO quote_requests (folio, request_type, channel, package_title, destination_text, origin_city, travel_type,
        budget_range, budget_clp, adults, children, passenger_name, passenger_email, passenger_phone, comments, details_json,
        status, assigned_to, created_at, quoted_at, last_contact_at, closed_at, sale_amount_clp, selected_addons_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        NOW() - INTERVAL ? HOUR, IF(? < 0, NULL, NOW() - INTERVAL ? HOUR), NOW() - INTERVAL ? HOUR,
        IF(? < 0, NULL, NOW() - INTERVAL ? HOUR), ?, ?)'
);
$act = $mysqli->prepare('INSERT INTO quote_activity (quote_id, author_id, kind, body, created_at) VALUES (?, ?, ?, ?, NOW() - INTERVAL ? HOUR)');

$total = 42;
for ($i = 0; $i < $total; $i++) {
    $edadDias = (int) round(pow($i / $total, 1.3) * 80);          // más densidad reciente
    $creadoH = $edadDias * 24 + mt_rand(0, 20);
    $canal = $pick($canales);
    $tipoSol = $canal === 'web' && mt_rand(0, 2) === 0 ? 'paquete' : 'a_medida';
    $destino = $pick($destinos);
    [$rango, $presupuestoPp] = $pick($rangos);
    $adultos = mt_rand(1, 4);
    $ninos = mt_rand(0, 3) === 0 ? mt_rand(1, 2) : 0;
    $pax = $adultos + $ninos;
    $nombre = $pick($nombres);
    $correo = strtolower(str_replace([' ', 'á', 'é', 'í', 'ó', 'ú', 'ñ'], ['.', 'a', 'e', 'i', 'o', 'u', 'n'], $nombre)) . mt_rand(1, 99) . '@correo.cl';
    $tel = '+56 9 ' . mt_rand(5000, 9999) . ' ' . mt_rand(1000, 9999);

    // Estado según antigüedad: lo reciente sigue abierto, lo antiguo ya se resolvió.
    $r = mt_rand(1, 100);
    if ($edadDias <= 2) $estado = $r < 70 ? 'nueva' : 'cotizacion_enviada';
    elseif ($edadDias <= 14) $estado = $r < 15 ? 'nueva' : ($r < 50 ? 'cotizacion_enviada' : ($r < 80 ? 'en_seguimiento' : ($r < 92 ? 'respondido' : 'venta_cerrada')));
    else $estado = $r < 10 ? 'en_seguimiento' : ($r < 20 ? 'respondido' : ($r < 55 ? 'venta_cerrada' : 'no_interesado'));

    $cotizadoH = $estado === 'nueva' ? -1 : max(1, $creadoH - mt_rand(6, 60));
    // Último contacto: algunas abiertas se "olvidan" para que aparezcan alertas.
    $ultimoH = $estado === 'nueva' ? $creadoH : max(1, ($cotizadoH > 0 ? $cotizadoH : $creadoH) - mt_rand(0, 72));
    if (in_array($estado, ['cotizacion_enviada', 'en_seguimiento', 'respondido'], true) && mt_rand(0, 3) === 0) {
        $ultimoH = min($creadoH, 24 * mt_rand(4, 9));
    }
    $cerradoH = in_array($estado, ['venta_cerrada', 'no_interesado'], true) ? max(1, $ultimoH - mt_rand(0, 24)) : -1;
    if ($edadDias >= 6 && $edadDias <= 30 && mt_rand(0, 2) === 0) {
        $estado = 'venta_cerrada';
        $cotizadoH = $cotizadoH > 0 ? $cotizadoH : $creadoH - 24;
        $cerradoH = mt_rand(10, max(11, (int) date('j') * 24 - 12)); // dentro del mes en curso
        $ultimoH = $cerradoH;
    }
    $venta = $estado === 'venta_cerrada' ? (int) (round($presupuestoPp * $pax * mt_rand(85, 115) / 100 / 1000) * 1000) : null;
    $budgetTotal = $presupuestoPp * $pax;
    $resp = $estado === 'nueva' && mt_rand(0, 1) ? null : $pick($equipo);

    $folio = sprintf('%s-%s-%04d', $canal === 'telefono' ? 'TEL' : 'WEB', date('ymd', time() - $creadoH * 3600), mt_rand(1000, 9999));
    $paquete = $tipoSol === 'paquete' ? $destino . ' – Todo Incluido' : null;
    $comentario = $pick(['', '', 'Es nuestro aniversario.', 'Preferimos hotel con piscina.', 'Viajamos con mi mamá de 70 años.', 'Queremos fechas flexibles.']);
    $details = json_encode(['demo' => true, 'incluir' => ['Vuelo', 'Hotel'], 'cuando' => $pick(['En los próximos 3 meses', 'Entre 3 y 6 meses', 'En más de 6 meses'])], JSON_UNESCAPED_UNICODE);
    $addons = '[]';
    $tipoViaje = $pick($tipos);
    $ciudad = $pick($ciudades);

    $insert->bind_param(
        'ssssssssiiisssssssiiiiiiis',
        $folio, $tipoSol, $canal, $paquete, $destino, $ciudad, $tipoViaje,
        $rango, $budgetTotal, $adultos, $ninos, $nombre, $correo, $tel, $comentario, $details,
        $estado, $resp, $creadoH, $cotizadoH, $cotizadoH, $ultimoH, $cerradoH, $cerradoH, $venta, $addons
    );
    $insert->execute();
    $qid = $mysqli->insert_id;

    // Historial
    $log = [[null, 'sistema', 'Solicitud recibida por ' . ['web' => 'el sitio web', 'telefono' => 'teléfono', 'whatsapp' => 'WhatsApp', 'instagram' => 'Instagram', 'correo' => 'correo', 'referido' => 'recomendación'][$canal], $creadoH]];
    if ($resp) $log[] = [$resp, 'asignacion', 'Asignada a ' . ($resp === $pia ? 'Pía' : 'Carolina'), $creadoH - 1];
    if ($cotizadoH > 0) $log[] = [$resp ?? $carolina, 'estado', 'Cotización enviada por correo', $cotizadoH];
    if (in_array($estado, ['en_seguimiento', 'respondido', 'venta_cerrada'], true)) $log[] = [$resp ?? $carolina, 'nota', $pick(['Llamada de seguimiento, pide unos días para decidir.', 'Consultó por pago en cuotas.', 'Le envié opciones de hotel alternativas.', 'Respondió por WhatsApp, interesado.']), max(1, $ultimoH)];
    if ($estado === 'venta_cerrada') $log[] = [$resp ?? $carolina, 'estado', 'Venta cerrada por $' . number_format($venta, 0, ',', '.'), max(1, $cerradoH)];
    if ($estado === 'no_interesado') $log[] = [$resp ?? $carolina, 'estado', $pick(['El pasajero decidió no viajar.', 'Eligió otra agencia.', 'Sin respuesta tras 3 contactos.']), max(1, $cerradoH)];
    foreach ($log as [$autor, $kind, $body, $h]) {
        $act->bind_param('isssi', $qid, $autor, $kind, $body, $h);
        $act->execute();
    }
}
echo "Creadas $total solicitudes de ejemplo (marcadas demo=true).\n";
