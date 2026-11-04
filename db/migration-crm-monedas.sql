-- CRM · monedas de referencia (pesos chilenos por unidad) para el tablero. Aditiva. Respaldar antes y ejecutar una sola vez.
-- USD y EUR vienen del Banco Central de Chile (vía mindicador.cl); las demás son referenciales (ExchangeRate-API) y se
-- calculan contra el dólar observado. Se refrescan solas cada 6 horas. NO se usan para fijar precios (eso es solo USD → CLP).
CREATE TABLE fx_rates (
  code CHAR(3) NOT NULL,
  clp DECIMAL(14,4) NOT NULL,
  rate_date DATE NULL,
  official TINYINT(1) NOT NULL DEFAULT 0,
  fetched_at DATETIME NOT NULL,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
