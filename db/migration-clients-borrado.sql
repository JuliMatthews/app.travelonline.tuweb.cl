-- Registro de clientes eliminados desde el CRM (quién, cuándo y qué ficha era).
-- Correr UNA vez. No toca ningún dato existente.
CREATE TABLE client_deletions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  client_name VARCHAR(190) NOT NULL,
  client_email VARCHAR(190) NOT NULL,
  source VARCHAR(20) NULL,
  deleted_by_id CHAR(36) NULL,
  deleted_by_email VARCHAR(190) NOT NULL,
  deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
