-- Migración CRM (rama `rediseno`) — trae al panel lo mejor del CRM de Francisco
-- (posibles_integraciones/02-francisco-crm-maqueta) sin perder lo que ya existe.
--
-- 1. Estados: de 4 (nueva/en_proceso/ganada/perdida) a los 6 del plan de trabajo
--    de Travel Online. Los datos existentes se re-mapean:
--      en_proceso → en_seguimiento · ganada → venta_cerrada · perdida → no_interesado
-- 2. Una solicitud ya no es solo "cotización de un paquete": también viajes a
--    medida, llamadas telefónicas, etc. (paquete y correo pasan a opcionales).
-- 3. Seguimiento comercial: folio, canal, fechas de cotización/último contacto/
--    cierre, monto de venta, presupuesto aproximado — base de los KPIs del tablero.
-- 4. Historial de actividad (timeline) por solicitud.
--
-- MySQL 5.7 (mismo motor que producción). Idempotente NO: correr una sola vez.

-- 1) Estados ---------------------------------------------------------------
ALTER TABLE quote_requests MODIFY status ENUM(
  'nueva', 'en_proceso', 'ganada', 'perdida',
  'cotizacion_enviada', 'en_seguimiento', 'respondido', 'venta_cerrada', 'no_interesado'
) NOT NULL DEFAULT 'nueva';

UPDATE quote_requests SET status = 'en_seguimiento' WHERE status = 'en_proceso';
UPDATE quote_requests SET status = 'venta_cerrada'  WHERE status = 'ganada';
UPDATE quote_requests SET status = 'no_interesado'  WHERE status = 'perdida';

ALTER TABLE quote_requests MODIFY status ENUM(
  'nueva', 'cotizacion_enviada', 'en_seguimiento', 'respondido', 'venta_cerrada', 'no_interesado'
) NOT NULL DEFAULT 'nueva';

-- 2) Solicitudes que no son de un paquete -----------------------------------
ALTER TABLE quote_requests
  MODIFY package_slug VARCHAR(190) NULL,
  MODIFY package_title VARCHAR(255) NULL,
  MODIFY passenger_email VARCHAR(190) NULL,
  MODIFY adults INT NOT NULL DEFAULT 1,
  MODIFY children INT NOT NULL DEFAULT 0,
  MODIFY selected_addons_json JSON NULL;

-- 3) Seguimiento comercial --------------------------------------------------
ALTER TABLE quote_requests
  ADD COLUMN folio VARCHAR(24) NULL AFTER id,
  ADD COLUMN request_type ENUM('paquete', 'a_medida', 'reunion', 'problema') NOT NULL DEFAULT 'paquete' AFTER folio,
  ADD COLUMN channel ENUM('web', 'telefono', 'whatsapp', 'instagram', 'correo', 'referido', 'otro') NOT NULL DEFAULT 'web' AFTER request_type,
  ADD COLUMN destination_text VARCHAR(190) NULL AFTER package_title,
  ADD COLUMN origin_city VARCHAR(120) NULL AFTER destination_text,
  ADD COLUMN travel_type VARCHAR(40) NULL AFTER origin_city,
  ADD COLUMN budget_range VARCHAR(60) NULL AFTER travel_type,
  ADD COLUMN budget_clp INT NULL AFTER budget_range,
  ADD COLUMN details_json JSON NULL AFTER comments,
  ADD COLUMN quoted_at DATETIME NULL AFTER assigned_to,
  ADD COLUMN last_contact_at DATETIME NULL AFTER quoted_at,
  ADD COLUMN closed_at DATETIME NULL AFTER last_contact_at,
  ADD COLUMN sale_amount_clp INT NULL AFTER closed_at,
  ADD COLUMN received_by CHAR(36) NULL AFTER sale_amount_clp,
  ADD UNIQUE KEY quote_requests_folio_uq (folio),
  ADD INDEX (status),
  ADD INDEX (channel),
  ADD INDEX (last_contact_at),
  ADD CONSTRAINT quote_requests_received_by_fk FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL;

-- Las filas que ya existían: destino = paquete, último contacto = creación,
-- y un folio con el mismo formato que el sitio (WEB-AAMMDD-NNNN, con el id
-- para no chocar).
UPDATE quote_requests SET
  destination_text = COALESCE(destination_text, package_title),
  last_contact_at = COALESCE(last_contact_at, created_at),
  folio = COALESCE(folio, CONCAT('WEB-', DATE_FORMAT(created_at, '%y%m%d'), '-', LPAD(id, 4, '0')));

-- 4) Historial de actividad -------------------------------------------------
CREATE TABLE quote_activity (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  quote_id INT NOT NULL,
  author_id CHAR(36) NULL,
  kind ENUM('nota', 'estado', 'asignacion', 'sistema') NOT NULL DEFAULT 'nota',
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quote_activity_quote_fk FOREIGN KEY (quote_id) REFERENCES quote_requests(id) ON DELETE CASCADE,
  CONSTRAINT quote_activity_author_fk FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX (quote_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
