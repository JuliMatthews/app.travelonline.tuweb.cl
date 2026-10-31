<?php
// Correo HTML de una cotización (estilos en línea: los clientes de correo ignoran <style>).
// Misma paleta que el PDF: marino #2d4874, mar #406e81, rosa #dab9b1, terracota #99634f.

function qe_h(?string $s): string { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
function qe_clp(int $n): string { return '$' . number_format($n, 0, ',', '.'); }

const QE_EMPRESA = [
    'razon' => 'Travel Online SPA', 'direccion' => 'Galvarino Gallardo 1941, Providencia, Santiago',
    'grupo' => 'Parte del Grupo Chirak Turismo', 'telefono' => '+56 2 3366 1174', 'whatsapp' => '+56 9 8199 1292',
    'correo' => 'reservas@travelonline.cl', 'horario' => 'L-V 10-14 h y 15-18 h · Sáb 10-14 h',
];

function qe_label(int $number, int $version): string { return $version <= 1 ? (string) $number : "$number." . ($version - 1); }

// $intro: texto de cabecera (HTML ya escapado). $panelUrl: solo en el correo de revisión interna.
function render_quote_email(array $v, array $req, string $brandName, string $intro, ?string $panelUrl = null): string {
    $label = qe_label((int) $v['number'], (int) $v['version']);
    $lines = json_decode($v['lines_json'], true) ?: [];
    $subtotal = array_sum(array_map(fn($l) => (int) $l['amountClp'], $lines));
    $rows = '';
    foreach ($lines as $l) {
        $rows .= '<tr><td style="padding:10px 14px;border-top:1px solid #edf0f5;font-size:14px"><b>' . qe_h($l['title']) . '</b>'
            . ($l['detail'] !== '' ? '<br><span style="color:#6b7385;font-size:12px">' . qe_h($l['detail']) . '</span>' : '')
            . '</td><td style="padding:10px 14px;border-top:1px solid #edf0f5;text-align:right;white-space:nowrap;font-size:14px">' . qe_clp((int) $l['amountClp']) . '</td></tr>';
    }
    $list = function (?string $t, string $mark, string $color) {
        $out = '';
        foreach (array_filter(array_map('trim', explode("\n", (string) $t))) as $i) {
            $out .= '<div style="font-size:13px;margin:3px 0"><span style="color:' . $color . ';font-weight:bold">' . $mark . '</span> ' . qe_h($i) . '</div>';
        }
        return $out;
    };
    $disc = (int) $v['discount_clp'] > 0
        ? '<tr><td style="padding:4px 14px;color:#6b7385">Subtotal</td><td style="padding:4px 14px;text-align:right">' . qe_clp($subtotal) . '</td></tr>'
          . '<tr><td style="padding:4px 14px">' . qe_h($v['discount_label'] ?: 'Descuento') . '</td><td style="padding:4px 14px;text-align:right">− ' . qe_clp((int) $v['discount_clp']) . '</td></tr>'
        : '';
    $pp = qe_clp((int) round($v['total_clp'] / max(1, (int) $v['pax'])));
    $valid = $v['valid_until'] ? '<p style="margin:18px 0 0;padding:10px 14px;border-left:4px solid #99634f;background:#fff;font-size:12.5px"><b>Cotización válida hasta el '
        . date('d-m-Y', strtotime($v['valid_until'])) . '.</b> Los valores pueden variar según disponibilidad al momento de confirmar la reserva.</p>' : '';
    $panel = $panelUrl ? '<p style="margin:14px 0 0;font-size:12.5px"><a href="' . qe_h($panelUrl) . '" style="color:#2d4874;font-weight:bold">Abrir esta versión (PDF) en el panel</a></p>' : '';
    $e = QE_EMPRESA;

    return '<!doctype html><html><body style="margin:0;background:#e9edf3;font-family:Arial,Helvetica,sans-serif;color:#1b2433">'
      . '<div style="max-width:640px;margin:0 auto;background:#fbfaf9">'
      . '<div style="background:#2d4874;color:#fff;padding:22px 26px"><div style="font-size:22px;font-weight:bold">' . qe_h($brandName) . '</div>'
      . '<div style="font-size:11.5px;opacity:.85;margin-top:4px">' . qe_h($e['razon']) . ' · ' . qe_h($e['direccion']) . '</div>'
      . '<div style="margin-top:12px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.8">Cotización N°</div>'
      . '<div style="font-size:30px;font-weight:bold;color:#dab9b1">' . qe_h($label) . '</div>'
      . '<div style="font-size:12px;opacity:.9">' . qe_h($req['folio']) . '</div></div>'
      . '<div style="padding:22px 26px">'
      . '<p style="margin:0 0 16px;font-size:14px;line-height:1.5">' . $intro . '</p>'
      . '<div style="background:#fff;border:1px solid #e3e7ee;border-radius:10px;padding:12px 14px;font-size:13.5px"><b>' . qe_h($req['passenger_name']) . '</b><br>'
      . qe_h($v['title']) . ($v['subtitle'] ? ' · ' . qe_h($v['subtitle']) : '') . ' · ' . (int) $v['pax'] . ' pasajero' . ((int) $v['pax'] === 1 ? '' : 's') . '</div>'
      . '<table width="100%" cellspacing="0" style="margin-top:14px;background:#fff;border:1px solid #e3e7ee;border-radius:10px">' . $rows . '</table>'
      . '<table width="100%" cellspacing="0" style="margin-top:10px;font-size:14px">' . $disc . '</table>'
      . '<div style="margin-top:8px;background:#2d4874;color:#fff;border-radius:10px;padding:12px 16px;font-size:15px">Total <b style="float:right;font-size:22px">' . qe_clp((int) $v['total_clp']) . '</b><div style="clear:both"></div></div>'
      . '<p style="margin:5px 4px 0;text-align:right;color:#6b7385;font-size:12px">' . $pp . ' por persona</p>'
      . '<div style="margin-top:18px;background:#e9eee6;border-radius:10px;padding:12px 14px"><b style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#2d4874">Incluye</b>' . $list($v['includes_text'], '✓', '#4d6b3f') . '</div>'
      . '<div style="margin-top:10px;background:#f3e8e4;border-radius:10px;padding:12px 14px"><b style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#2d4874">No incluye</b>' . $list($v['excludes_text'], '✗', '#99634f') . '</div>'
      . $valid . $panel . '</div>'
      . '<div style="background:#1c2c47;color:#cfd8e6;padding:18px 26px;font-size:12px;line-height:1.6"><b style="color:#fff">Travel Online</b><br>'
      . qe_h($e['direccion']) . '. ' . qe_h($e['grupo']) . '.<br>' . qe_h($e['telefono']) . ' · WhatsApp ' . qe_h($e['whatsapp']) . ' · ' . qe_h($e['correo']) . '<br>' . qe_h($e['horario'])
      . '<br><span style="opacity:.7">© ' . date('Y') . ' ' . qe_h($e['razon']) . '. Todos los derechos reservados.</span></div>'
      . '</div></body></html>';
}

// Envía un correo HTML. Con MAIL_DRY_RUN guarda el .eml en mail-outbox/ y devuelve true.
function send_html_mail(string $to, string $subject, string $html, ?string $bcc, ?string $replyTo): bool {
    $subjectEnc = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $from = defined('MAIL_FROM') ? MAIL_FROM : 'reservas@travelonline.cl';
    $headers = ["From: Travel Online <$from>", 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8'];
    if ($replyTo) $headers[] = "Reply-To: $replyTo";
    if ($bcc) $headers[] = "Bcc: $bcc";
    if (defined('MAIL_DRY_RUN') && MAIL_DRY_RUN) {
        $dir = __DIR__ . '/../mail-outbox';
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        $file = $dir . '/' . date('Ymd-His') . '-' . preg_replace('/[^a-z0-9]+/i', '_', $to) . '.eml';
        return file_put_contents($file, "To: $to\nSubject: $subject\n" . implode("\n", $headers) . "\n\n" . $html) !== false;
    }
    return @mail($to, $subjectEnc, $html, implode("\r\n", $headers), '-f' . $from);
}
