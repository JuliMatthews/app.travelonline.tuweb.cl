-- CRM · de qué paquete del catálogo se cargó el itinerario de cada versión de cotización (trazabilidad).
-- Aditiva y nullable. Respaldar la BD antes y ejecutar una sola vez.
ALTER TABLE quotation_versions
  ADD COLUMN itinerary_package_id CHAR(36) NULL AFTER itinerary_json;
