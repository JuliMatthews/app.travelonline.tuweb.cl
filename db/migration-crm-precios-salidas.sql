-- CRM · precios en dólares con tipo de cambio y margen, proveedor y vigencia por programa, y salidas con fecha.
-- Aditiva (no borra ni cambia datos existentes). Respaldar la BD antes y ejecutar una sola vez.

-- Margen que Travel Online suma sobre la tarifa del proveedor (ej.: Fantástica China +20 %). 0 = sin margen.
ALTER TABLE operators
  ADD COLUMN markup_pct DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER commission_pct;

ALTER TABLE packages
  ADD COLUMN operator_id INT(11) NULL AFTER region_id,
  ADD COLUMN price_usd DECIMAL(10,2) NULL AFTER price_to_clp,
  ADD COLUMN tariff_valid_until DATE NULL AFTER price_usd,
  ADD COLUMN departures_text VARCHAR(255) NULL AFTER tariff_valid_until,
  ADD KEY packages_operator_idx (operator_id),
  ADD CONSTRAINT packages_operator_fk FOREIGN KEY (operator_id) REFERENCES operators (id) ON DELETE SET NULL;

-- Salidas con fecha concreta. "tier" guarda la tarifa/color tal como lo trae el proveedor (ej. "Rojo", "Tarifa USD 1.980").
CREATE TABLE package_departures (
  id INT(11) NOT NULL AUTO_INCREMENT,
  package_id CHAR(36) NOT NULL,
  departs_on DATE NOT NULL,
  tier VARCHAR(60) NULL,
  price_usd DECIMAL(10,2) NULL,
  seats INT(11) NULL,
  note VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY package_date_tier (package_id, departs_on, tier),
  KEY departs_on (departs_on),
  CONSTRAINT package_departures_pkg_fk FOREIGN KEY (package_id) REFERENCES packages (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ajustes de precio: tipo de cambio USD→CLP (vacío = sin definir; el recálculo queda bloqueado) y redondeo.
INSERT IGNORE INTO crm_settings (k, v) VALUES ('usd_clp_rate', ''), ('price_round_step', '1000');
