-- CRM · bloque A de la reunión del 30-oct-2026 (aditiva: no borra ni modifica datos).
-- 1) Roles nuevos: 'operaciones' (Carolina) y 'reportes' (solo ventas cerradas/comisiones).
-- 2) Marca por solicitud (CRM único Travel Online + Travel Viajes).
-- 3) Canal 'asistente' (cotizar con asistente = chatbot) distinto de WhatsApp directo.
-- 4) Mensajes internos entre ejecutivas dentro de cada solicitud.
-- Orden: respaldar la BD → ejecutar este archivo una sola vez.

ALTER TABLE users
  MODIFY role ENUM('super_admin', 'admin_viewer', 'editor', 'operaciones', 'reportes') NOT NULL;

ALTER TABLE quote_requests
  ADD COLUMN brand ENUM('travel_online', 'travel_viajes') NOT NULL DEFAULT 'travel_online' AFTER channel,
  ADD INDEX (brand),
  MODIFY channel ENUM('web', 'telefono', 'whatsapp', 'asistente', 'instagram', 'correo', 'referido', 'otro') NOT NULL DEFAULT 'web';

ALTER TABLE quote_activity
  MODIFY kind ENUM('nota', 'estado', 'asignacion', 'sistema', 'mensaje') NOT NULL DEFAULT 'nota',
  ADD COLUMN to_user_id CHAR(36) NULL AFTER author_id,
  ADD COLUMN read_at DATETIME NULL AFTER created_at,
  ADD CONSTRAINT quote_activity_to_user_fk FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD INDEX (to_user_id, read_at);
