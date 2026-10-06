-- Migración incremental: agrega el sistema de cuentas de cliente a una base
-- que ya existe (local o producción) sin tocar ninguna tabla ni dato previo.
-- Correr UNA sola vez por base de datos (no usa IF NOT EXISTS a propósito,
-- para notar de inmediato si se intenta correr dos veces).

CREATE TABLE clients (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  name VARCHAR(190) NOT NULL,
  phone VARCHAR(64) NULL,
  google_sub VARCHAR(64) NULL UNIQUE,
  email_verified_at DATETIME NULL,
  internal_notes MEDIUMTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE client_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(64) NULL,
  CONSTRAINT client_sessions_client_fk FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  INDEX (client_id),
  INDEX (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE client_email_verifications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  CONSTRAINT client_email_verifications_client_fk FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  INDEX (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE quote_requests ADD COLUMN client_id CHAR(36) NULL AFTER package_title;
ALTER TABLE quote_requests ADD CONSTRAINT quote_requests_client_fk FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE quote_requests ADD INDEX (client_id);
