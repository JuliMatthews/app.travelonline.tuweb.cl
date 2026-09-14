<?php
require_once __DIR__ . '/inc/json.php';
require_once __DIR__ . '/inc/auth.php';
install_json_error_handlers();

$session = require_auth('blog:view');
$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'];
$mysqli = db();

function blog_summary_row(array $row): array {
    return [
        'id' => $row['id'],
        'slug' => $row['slug'],
        'title' => $row['title'],
        'excerpt' => $row['excerpt'],
        'status' => $row['status'],
        'publishedAt' => $row['published_at'],
        'featuredImage' => $row['image_id'] ? ['id' => $row['image_id'], 'extension' => $row['image_ext']] : null,
    ];
}

if ($action === 'list' && $method === 'GET') {
    $res = $mysqli->query(
        'SELECT b.id, b.slug, b.title, b.excerpt, b.status, b.published_at,
                i.id AS image_id, i.file_extension AS image_ext
         FROM blog_posts b LEFT JOIN images i ON i.id = b.featured_image_id
         ORDER BY b.published_at DESC'
    );
    $rows = [];
    while ($r = $res->fetch_assoc()) $rows[] = blog_summary_row($r);
    json_ok(['posts' => $rows]);
}

if ($action === 'get' && $method === 'GET') {
    $id = $_GET['id'] ?? '';
    $stmt = $mysqli->prepare(
        'SELECT b.*, i.id AS image_id, i.file_extension AS image_ext
         FROM blog_posts b LEFT JOIN images i ON i.id = b.featured_image_id
         WHERE b.id = ?'
    );
    $stmt->bind_param('s', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) json_error('Post no encontrado', 404);
    $post = blog_summary_row($row);
    $post['content'] = $row['content'];
    json_ok(['post' => $post]);
}

if ($action === 'create' && $method === 'POST') {
    require_auth('blog:create');
    $input = json_body();
    $id = new_uuid();
    $userId = $session['user']['id'];
    $featuredImageId = $input['featuredImageId'] ?: null;
    $publishedAt = $input['publishedAt'] ?: null;

    $stmt = $mysqli->prepare(
        'INSERT INTO blog_posts (id, slug, title, excerpt, content, featured_image_id, status, published_at, created_by, updated_by)
         VALUES (?,?,?,?,?,?,?,?,?,?)'
    );
    $stmt->bind_param(
        'ssssssssss',
        $id, $input['slug'], $input['title'], $input['excerpt'], $input['content'],
        $featuredImageId, $input['status'], $publishedAt, $userId, $userId
    );
    if (!$stmt->execute()) {
        $stmt->close();
        if ($mysqli->errno === 1062) json_error('Ya existe un post con ese slug', 409);
        json_error('No se pudo crear el post', 500);
    }
    $stmt->close();
    json_ok(['id' => $id]);
}

if ($action === 'update' && $method === 'POST') {
    require_auth('blog:edit');
    $id = $_GET['id'] ?? '';
    $input = json_body();
    $userId = $session['user']['id'];
    $featuredImageId = $input['featuredImageId'] ?: null;
    $publishedAt = $input['publishedAt'] ?: null;

    $stmt = $mysqli->prepare(
        'UPDATE blog_posts SET slug=?, title=?, excerpt=?, content=?, featured_image_id=?, status=?, published_at=?, updated_by=?
         WHERE id=?'
    );
    $stmt->bind_param(
        'sssssssss',
        $input['slug'], $input['title'], $input['excerpt'], $input['content'],
        $featuredImageId, $input['status'], $publishedAt, $userId, $id
    );
    if (!$stmt->execute()) {
        $stmt->close();
        if ($mysqli->errno === 1062) json_error('Ya existe un post con ese slug', 409);
        json_error('No se pudo actualizar el post', 500);
    }
    $stmt->close();
    json_ok(['id' => $id]);
}

if ($action === 'delete' && $method === 'POST') {
    require_auth('blog:delete');
    $id = $_GET['id'] ?? '';
    $stmt = $mysqli->prepare('DELETE FROM blog_posts WHERE id = ?');
    $stmt->bind_param('s', $id);
    $stmt->execute();
    $stmt->close();
    json_ok([]);
}

json_error('Ruta no encontrada', 404);
