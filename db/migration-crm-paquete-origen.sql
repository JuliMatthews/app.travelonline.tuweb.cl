-- CRM · "Guardar como paquete": recuerda qué paquete (borrador) salió de cada cotización,
-- para no duplicarlo y poder abrirlo desde la cotización. Aditiva. Respaldar antes.
ALTER TABLE quotations
  ADD COLUMN package_id CHAR(36) NULL AFTER number;
