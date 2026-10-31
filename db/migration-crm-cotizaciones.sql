-- CRM · cotizaciones versionadas (pedido de Francisco, reunión 30-oct-2026). Aditiva.
-- Una solicitud tiene UNA cotización (N° 1001, 1002…) y esa cotización tiene versiones
-- (1001.1, 1001.2…). Una versión en 'borrador' se edita; al marcarla 'enviada' queda
-- congelada y cualquier cambio crea una versión nueva. Así el historial no se pierde
-- y el PDF de cada versión siempre es el mismo que se mandó.
-- Orden: respaldar la BD → ejecutar una sola vez.

CREATE TABLE quotations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  number INT NOT NULL,
  created_by CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY quotations_request_uq (request_id),
  UNIQUE KEY quotations_number_uq (number),
  CONSTRAINT quotations_request_fk FOREIGN KEY (request_id) REFERENCES quote_requests(id) ON DELETE CASCADE,
  CONSTRAINT quotations_user_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE quotation_versions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  quotation_id INT NOT NULL,
  version INT NOT NULL,
  status ENUM('borrador', 'enviada') NOT NULL DEFAULT 'borrador',
  title VARCHAR(255) NOT NULL DEFAULT '',
  subtitle VARCHAR(255) NULL,
  pax INT NOT NULL DEFAULT 1,
  lines_json JSON NOT NULL,
  discount_clp INT NOT NULL DEFAULT 0,
  discount_label VARCHAR(190) NULL,
  total_clp INT NOT NULL DEFAULT 0,
  includes_text TEXT NULL,
  excludes_text TEXT NULL,
  valid_until DATE NULL,
  change_reason VARCHAR(500) NULL,
  created_by CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  UNIQUE KEY quotation_versions_uq (quotation_id, version),
  CONSTRAINT quotation_versions_q_fk FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
  CONSTRAINT quotation_versions_user_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
