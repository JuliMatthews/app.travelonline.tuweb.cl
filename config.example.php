<?php
// Copiar a config.php (gitignored) y completar con credenciales reales.
// NUNCA subir config.php al repo ni pisar el de producción con el de local.

define('DB_HOST', 'localhost');
define('DB_PORT', 3306);
define('DB_NAME', 'travelonline');
define('DB_USER', 'travelonline');
define('DB_PASS', 'travelonline_local_only');

// Carpeta real en disco donde se guardan las imágenes subidas — servida
// directo por Apache (sin PHP en el GET), debe ser escribible (0755+).
define('UPLOAD_DIR', __DIR__ . '/uploads');

// Duración de la sesión del panel, en días.
define('SESSION_DAYS', 7);

// Nombre de la cookie de sesión.
define('SESSION_COOKIE_NAME', 'to_admin_session');
