-- Amplía la tabla EXISTENTE `quote_requests` (tiene datos reales de prueba,
-- por eso ALTER y nunca recrear) para que el dashboard pueda gestionar
-- solicitudes: relacionarlas con el paquete real, dejar notas internas,
-- asignarlas a un usuario, y llevar un pipeline de estado.
ALTER TABLE quote_requests
  ADD COLUMN package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
  ADD COLUMN internal_notes TEXT,
  ADD COLUMN assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- La columna `status` ya existía (default 'nueva', sin restricción) — se le
-- agrega el pipeline real que usará el dashboard. Si en el futuro se agrega
-- un valor nuevo al pipeline, hay que migrar esta constraint también.
ALTER TABLE quote_requests
  ADD CONSTRAINT quote_requests_status_check
    CHECK (status IN ('nueva', 'en_proceso', 'ganada', 'perdida'));
