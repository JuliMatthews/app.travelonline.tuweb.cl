-- CRM · itinerario de viaje dentro de cada versión de cotización (pedido de Carolina, reunión 2-nov-2026).
-- itinerary_json: lista de días [{"title":"Día 1 · Llegada a Estambul","detail":"…"}]. flights_text: vuelos (texto libre).
-- Aditiva. Respaldar la BD antes y ejecutar una sola vez.
ALTER TABLE quotation_versions
  ADD COLUMN flights_text TEXT NULL AFTER excludes_text,
  ADD COLUMN itinerary_json JSON NULL AFTER flights_text;
