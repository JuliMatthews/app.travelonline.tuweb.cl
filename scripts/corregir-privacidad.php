<?php
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('Solo se ejecuta desde la terminal.'); }
// Corrige la página "Políticas de privacidad": quita el texto copiado del Consejo para la Transparencia
// (RUT, domicilio, banco de datos y correo contacto@consejotransparencia.cl) y pone una sección propia de
// Travel Online con responsable, finalidad, derechos del titular y contacto (gerencia@travelonline.cl).
// Idempotente: si ya no queda texto del Consejo, no hace nada. Borra las traducciones automáticas EN/PT de
// esa página para que no queden copias del texto viejo (se vuelven a generar).
// Uso: php scripts/corregir-privacidad.php [--dry]
require_once __DIR__ . '/../inc/db.php';
$dry = in_array('--dry', $argv, true);
$db = db();
$db->set_charset('utf8mb4');

$NUEVA = <<<'HTML'
<p><strong><em>Responsable del tratamiento de los datos:</em></strong></p>
<p>TRAVEL ONLINE SPA, RUT 77.858.561-8, con domicilio en Galvarino Gallardo N° 1941, comuna de Providencia, Santiago, es responsable del tratamiento de los datos personales que usted entrega en este sitio, conforme a la <a href="https://www.bcn.cl/leychile/navegar?idNorma=141599" target="_blank" rel="noopener noreferrer">Ley N° 19.628</a> sobre Protección de la Vida Privada.</p>
<p><strong><em>Para qué usamos sus datos:</em></strong></p>
<p>Utilizamos los datos que usted nos entrega (nombre, correo electrónico, teléfono y los detalles de su viaje) únicamente para responder sus consultas, preparar y enviarle cotizaciones, gestionar sus reservas y prestarle atención antes, durante y después de su viaje. No los usamos para fines distintos de los indicados en esta política.</p>
<p><strong><em>Sus derechos como titular de los datos:</em></strong></p>
<p>De acuerdo con la ley, usted puede en todo momento:</p>
<ul>
<li>Solicitar <strong>acceso</strong> a los datos que tenemos sobre usted, su origen y el destinatario, y el propósito de su almacenamiento.</li>
<li>Solicitar la <strong>modificación o rectificación</strong> de sus datos cuando sean erróneos, inexactos, equívocos o incompletos.</li>
<li>Solicitar la <strong>eliminación o cancelación</strong> de sus datos cuando su almacenamiento carezca de fundamento legal o estén caducos.</li>
<li><strong>Oponerse</strong> a que sus datos se utilicen para fines de publicidad, investigación de mercado o encuestas de opinión.</li>
</ul>
<p>Para ejercer cualquiera de estos derechos, escríbanos a <a href="mailto:gerencia@travelonline.cl">gerencia@travelonline.cl</a> indicando su nombre completo, el correo con el que nos contactó y claramente qué solicita. Responderemos dentro de los plazos que establece la ley.</p>
<p>Esta política se actualizará cuando entren en vigencia nuevas normas sobre protección de datos personales que nos sean aplicables, incluida la Ley N° 21.719.</p>

HTML;

$s = $db->query("SELECT id, content FROM static_pages WHERE slug = 'politicas-de-privacidad'")->fetch_assoc();
if (!$s) exit("No existe la página politicas-de-privacidad.\n");
$c = str_replace("\r\n", "\n", $s['content']);
if (stripos($c, 'consejotransparencia') === false && stripos($c, 'Consejo para la Transparencia') === false) {
    exit("Sin texto del Consejo para la Transparencia: nada que corregir.\n");
}
$a = strpos($c, '<p><em>Permite modificación');
$b = strpos($c, '<p><strong><em>Certificado SSL');
if ($a === false || $b === false || $b <= $a) exit("No encontré los límites del bloque a reemplazar (¿el texto cambió?). No se modificó nada.\n");
$removido = substr($c, $a, $b - $a);
$nuevo = substr($c, 0, $a) . $NUEVA . substr($c, $b);
echo "Se quitan " . mb_strlen($removido) . " caracteres del texto copiado y se agregan " . mb_strlen($NUEVA) . " propios.\n";
if (stripos($nuevo, 'consejotransparencia') !== false || stripos($nuevo, 'Consejo para la Transparencia') !== false) exit("Aún quedaría texto del Consejo fuera del bloque; revisar a mano. No se modificó nada.\n");
if ($dry) exit("[SIMULACIÓN] no se escribió nada.\n");
$st = $db->prepare('UPDATE static_pages SET content = ? WHERE id = ?');
$st->bind_param('ss', $nuevo, $s['id']);
$st->execute();
$st = $db->prepare('DELETE FROM static_page_translations WHERE page_id = ? AND is_machine_translated = 1');
$st->bind_param('s', $s['id']);
$st->execute();
echo "Listo: página corregida y traducciones automáticas viejas borradas (" . $st->affected_rows . ").\n";
