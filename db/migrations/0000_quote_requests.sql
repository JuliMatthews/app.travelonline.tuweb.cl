-- Tabla original de cotizaciones — creada antes de que existiera el
-- corredor de migraciones propio (vivía en cms/quotes-db-init/, aplicada por
-- Postgres vía docker-entrypoint-initdb.d). Se incorpora acá con
-- `IF NOT EXISTS` para que `admin/` sea autónomo: en un volumen ya migrado
-- (que ya tiene esta tabla) es un no-op; en un volumen nuevo, la crea antes
-- de que 0001+ la amplíen.
CREATE TABLE IF NOT EXISTS quote_requests (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    package_slug TEXT NOT NULL,
    package_title TEXT NOT NULL,

    adults INTEGER NOT NULL,
    children INTEGER NOT NULL,
    room_option_id TEXT,
    room_option_label TEXT,
    selected_addon_ids TEXT[] NOT NULL DEFAULT '{}',
    selected_addons_json JSONB NOT NULL DEFAULT '[]',

    -- Desglose calculado por el SERVIDOR (nunca lo que mandó el navegador) —
    -- ver web/src/lib/pricing.ts, calculateQuote().
    per_person_base_clp INTEGER,
    passengers_subtotal_clp INTEGER,
    addons_total_clp INTEGER NOT NULL DEFAULT 0,
    room_adjustment_clp INTEGER NOT NULL DEFAULT 0,
    total_clp INTEGER,
    deposit_suggested_clp INTEGER,

    preferred_date_from DATE,
    preferred_date_to DATE,
    passenger_name TEXT NOT NULL,
    passenger_email TEXT NOT NULL,
    passenger_phone TEXT NOT NULL,
    comments TEXT,

    status TEXT NOT NULL DEFAULT 'nueva'
);
