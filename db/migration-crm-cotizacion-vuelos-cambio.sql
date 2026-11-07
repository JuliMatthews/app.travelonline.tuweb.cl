-- CRM · cotización: tabla de vuelos estructurada (flights_json) y tipo de cambio usado cuando hay montos en USD.
-- fx_usd_clp = pesos por dólar con que se calcularon los montos en USD; fx_date = fecha de ese dólar;
-- fx_manual = 1 si quien cotizó escribió un dólar propio en vez del automático del sistema.
-- Aditiva y nullable. Respaldar la BD antes y ejecutar una sola vez.
ALTER TABLE quotation_versions
  ADD COLUMN flights_json JSON NULL AFTER flights_text,
  ADD COLUMN fx_usd_clp DECIMAL(12,2) NULL AFTER itinerary_package_id,
  ADD COLUMN fx_date DATE NULL AFTER fx_usd_clp,
  ADD COLUMN fx_manual TINYINT(1) NOT NULL DEFAULT 0 AFTER fx_date;
