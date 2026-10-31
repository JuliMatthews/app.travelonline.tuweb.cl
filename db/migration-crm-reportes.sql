-- CRM · reportes y comisiones. Aditiva. Respaldar antes.
-- operator_id = operador/proveedor de la venta; commission_pct = % de comisión del operador
-- congelado al cerrar la venta (si el % del operador cambia después, las ventas pasadas no se alteran).
ALTER TABLE quote_requests
  ADD COLUMN operator_id INT NULL AFTER sale_amount_clp,
  ADD COLUMN commission_pct DECIMAL(5,2) NULL AFTER operator_id,
  ADD INDEX (operator_id),
  ADD CONSTRAINT quote_requests_operator_fk FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE SET NULL;

-- Ajustes editables del CRM (clave/valor). Reparto de la comisión según las reglas de Francisco
-- (03-reglas-de-negocio.md): 20% ejecutiva que cierra, 5% gestión; el resto (75%) queda en la agencia.
CREATE TABLE crm_settings (
  k VARCHAR(60) NOT NULL PRIMARY KEY,
  v VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO crm_settings (k, v) VALUES ('commission_executive_pct', '20'), ('commission_management_pct', '5');
