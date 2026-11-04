-- CRM · cobros por solicitud (anticipos, saldos, montos fijos): quién debe qué, con qué link y si ya pagó.
-- Aditiva. Respaldar la BD antes y ejecutar una sola vez. El link de pago (p. ej. Webpay) se genera fuera del sistema y se pega aquí.
CREATE TABLE quote_payments (
  id INT(11) NOT NULL AUTO_INCREMENT,
  quote_id INT(11) NOT NULL,
  concept VARCHAR(160) NOT NULL,
  amount_clp INT(11) NOT NULL,
  method ENUM('webpay','transferencia','efectivo','otro') NOT NULL DEFAULT 'webpay',
  pay_url VARCHAR(500) NULL,
  status ENUM('pendiente','pagado','anulado') NOT NULL DEFAULT 'pendiente',
  due_date DATE NULL,
  paid_at DATETIME NULL,
  reference VARCHAR(120) NULL,
  created_by CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY quote_status (quote_id, status),
  KEY status_due (status, due_date),
  CONSTRAINT quote_payments_quote_fk FOREIGN KEY (quote_id) REFERENCES quote_requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
