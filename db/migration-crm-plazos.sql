-- CRM · plazo de entrega de cada versión de cotización (regla de la reunión: si el cliente
-- pide cambios, la cotización nueva sale al día siguiente). Aditiva. Respaldar antes.
ALTER TABLE quotation_versions
  ADD COLUMN promised_at DATE NULL AFTER valid_until,
  ADD INDEX (status, promised_at);
