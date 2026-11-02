-- CRM · nota interna de cada paquete (proveedor, precio original en USD, salidas, vigencia, dudas).
-- Viene del Excel de programas (columna "Notas / dudas") y NUNCA se muestra en el sitio público.
-- Aditiva. Respaldar la BD antes y ejecutar una sola vez.
ALTER TABLE packages
  ADD COLUMN internal_notes TEXT NULL AFTER not_included;
