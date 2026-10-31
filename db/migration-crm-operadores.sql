-- CRM · directorio de operadores y proveedores (modo consulta). Aditiva. Respaldar antes.
-- La comisión es sensible: solo la ven los roles con permiso 'operators:commission'.
CREATE TABLE operators (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  country VARCHAR(100) NOT NULL DEFAULT '',
  kind VARCHAR(60) NOT NULL DEFAULT '',
  destinations_text VARCHAR(500) NULL,
  commission_pct DECIMAL(5,2) NULL,
  contact_name VARCHAR(190) NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(60) NULL,
  notes TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_demo TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (country), INDEX (kind), INDEX (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
