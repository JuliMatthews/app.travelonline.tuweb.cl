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

// URL pública de este panel — usada para construir URLs absolutas de imagen
// cuando hace falta guardarlas como texto fijo (p.ej. <img> incrustados en
// el contenido de una página estática). En producción: https://app.travelonline.cl
define('ADMIN_PUBLIC_URL', 'http://localhost:8801');

// Correo de cotizaciones. MAIL_REVIEW_TO = casilla de revisión (visible en el botón del PDF);
// MAIL_BCC_BOSS = copia oculta a gerencia en TODO envío (no se muestra en el panel).
// MAIL_DRY_RUN = true guarda el correo en mail-outbox/ en vez de enviarlo (para pruebas locales).
define('MAIL_FROM', 'reservas@ejemplo.cl');
define('MAIL_REVIEW_TO', 'reservas@ejemplo.cl');
define('MAIL_BCC_BOSS', 'gerencia@ejemplo.cl');
define('MAIL_DRY_RUN', false);
