<?php
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
install_json_error_handlers();

// Cobros de una solicitud (anticipos, saldos, montos fijos). Ver: 'quotes:view'. Crear o cambiar: 'quotes:edit'.
// El link de pago (Webpay, etc.) se genera fuera del sistema y se pega aquí; el sistema lleva el seguimiento.
$session = require_auth('quotes:view');
$user = $session['user'];
$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'];
$mysqli = db();

const PAY_METHODS = ['webpay', 'transferencia', 'efectivo', 'otro'];

function payment_json(array $r): array {
    return [
        'id' => (int) $r['id'], 'quoteId' => (int) $r['quote_id'], 'concept' => $r['concept'], 'amountClp' => (int) $r['amount_clp'],
        'method' => $r['method'], 'payUrl' => $r['pay_url'], 'status' => $r['status'], 'dueDate' => $r['due_date'],
        'paidAt' => $r['paid_at'], 'reference' => $r['reference'], 'createdAt' => $r['created_at'], 'createdBy' => $r['created_by_name'] ?? null,
        'overdue' => $r['status'] === 'pendiente' && !empty($r['due_date']) && $r['due_date'] < date('Y-m-d'),
    ];
}

function log_payment(mysqli $m, int $quoteId, string $authorId, string $body): void {
    $s = $m->prepare("INSERT INTO quote_activity (quote_id, author_id, kind, body) VALUES (?, ?, 'sistema', ?)");
    $s->bind_param('iss', $quoteId, $authorId, $body);
    $s->execute();
    $s->close();
}

function clp_fmt(int $n): string { return '$' . number_format($n, 0, ',', '.'); }

if ($action === 'list' && $method === 'GET') {
    $qid = (int) ($_GET['quoteId'] ?? 0);
    $s = $mysqli->prepare('SELECT p.*, u.name AS created_by_name FROM quote_payments p LEFT JOIN users u ON u.id = p.created_by WHERE p.quote_id = ? ORDER BY p.created_at, p.id');
    $s->bind_param('i', $qid);
    $s->execute();
    $res = $s->get_result();
    $rows = [];
    $paid = 0; $pending = 0;
    while ($r = $res->fetch_assoc()) {
        $rows[] = payment_json($r);
        if ($r['status'] === 'pagado') $paid += (int) $r['amount_clp'];
        if ($r['status'] === 'pendiente') $pending += (int) $r['amount_clp'];
    }
    $s->close();
    json_ok(['payments' => $rows, 'paidClp' => $paid, 'pendingClp' => $pending]);
}

if ($action === 'create' && $method === 'POST') {
    require_auth('quotes:edit');
    $in = json_body();
    $qid = (int) ($in['quoteId'] ?? 0);
    $concept = mb_substr(str_field($in, 'concept'), 0, 160);
    $amount = (int) ($in['amountClp'] ?? 0);
    $pm = (string) ($in['method'] ?? 'webpay');
    $url = trim((string) ($in['payUrl'] ?? ''));
    $due = (string) ($in['dueDate'] ?? '');
    if ($concept === '') json_error('Escribe el concepto del cobro (por ejemplo, «Anticipo»).');
    if ($amount < 1 || $amount > 200000000) json_error('El monto debe ser mayor que cero.');
    if (!in_array($pm, PAY_METHODS, true)) json_error('Método de pago no válido.');
    if ($url !== '' && (!preg_match('#^https://#i', $url) || mb_strlen($url) > 500 || !filter_var($url, FILTER_VALIDATE_URL))) json_error('El link de pago debe empezar con https://');
    if ($due !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $due)) json_error('Fecha límite no válida.');
    $chk = $mysqli->prepare('SELECT id FROM quote_requests WHERE id = ?');
    $chk->bind_param('i', $qid); $chk->execute();
    if (!$chk->get_result()->fetch_assoc()) json_error('Solicitud no encontrada', 404);
    $chk->close();
    $urlV = $url !== '' ? $url : null; $dueV = $due !== '' ? $due : null;
    $s = $mysqli->prepare('INSERT INTO quote_payments (quote_id, concept, amount_clp, method, pay_url, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $s->bind_param('isissss', $qid, $concept, $amount, $pm, $urlV, $dueV, $user['id']);
    $s->execute();
    $newId = $mysqli->insert_id;
    $s->close();
    log_payment($mysqli, $qid, $user['id'], "Cobro creado: $concept por " . clp_fmt($amount) . " ($pm)" . ($dueV ? " · límite $dueV" : ''));
    json_ok(['id' => $newId]);
}

if ($action === 'status' && $method === 'POST') {
    require_auth('quotes:edit');
    $in = json_body();
    $id = (int) ($in['id'] ?? 0);
    $st = (string) ($in['status'] ?? '');
    $ref = mb_substr(trim((string) ($in['reference'] ?? '')), 0, 120);
    if (!in_array($st, ['pendiente', 'pagado', 'anulado'], true)) json_error('Estado no válido.');
    $s = $mysqli->prepare('SELECT quote_id, concept, amount_clp, status FROM quote_payments WHERE id = ?');
    $s->bind_param('i', $id); $s->execute();
    $cur = $s->get_result()->fetch_assoc(); $s->close();
    if (!$cur) json_error('Cobro no encontrado', 404);
    if ($cur['status'] === $st) json_ok([]);
    $refV = $ref !== '' ? $ref : null;
    if ($st === 'pagado') {
        $u = $mysqli->prepare('UPDATE quote_payments SET status = ?, paid_at = NOW(), reference = COALESCE(?, reference) WHERE id = ?');
        $u->bind_param('ssi', $st, $refV, $id);
    } else {
        $u = $mysqli->prepare('UPDATE quote_payments SET status = ?, paid_at = NULL WHERE id = ?');
        $u->bind_param('si', $st, $id);
    }
    $u->execute(); $u->close();
    $verbo = ['pagado' => 'marcado como PAGADO', 'anulado' => 'ANULADO', 'pendiente' => 'devuelto a pendiente'][$st];
    log_payment($mysqli, (int) $cur['quote_id'], $user['id'], "Cobro «{$cur['concept']}» de " . clp_fmt((int) $cur['amount_clp']) . " $verbo" . ($st === 'pagado' && $refV ? " (ref. $refV)" : ''));
    json_ok([]);
}

json_error('Ruta no encontrada', 404);
