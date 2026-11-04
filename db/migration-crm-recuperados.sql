-- CRM · solicitudes "rescatadas" del correo info@travelviajes.cl (aditiva, correr una sola vez).
-- Marca las solicitudes que se recuperaron tras la caída del reenvío de correo (jun-nov 2026)
-- para poder filtrarlas y mostrar "Rescatado" / "Por atender" en la lista.
-- Lo que pidió el cliente va en details_json -> "recuperado" (no necesita más columnas).
-- Orden: respaldar la BD → ejecutar este archivo → scripts/importar-rescatados.php.
ALTER TABLE quote_requests
  ADD COLUMN recovered TINYINT(1) NOT NULL DEFAULT 0 AFTER brand,
  ADD INDEX (recovered);
