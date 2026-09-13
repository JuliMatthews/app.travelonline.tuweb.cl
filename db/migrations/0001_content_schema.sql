-- Esquema de contenido nuevo (reemplaza WordPress) — ver plan de migración
-- en ~/.claude/plans/luminous-prancing-lampson.md, sección "Modelo de datos".
-- IDs UUID nativos de Postgres 16 (gen_random_uuid(), sin extensión) —
-- reemplazan los IDs sintéticos/posicionales que generaba el resolver
-- GraphQL de WordPress para addons/room_options ("addon-0", "room-0").

CREATE TABLE regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  content TEXT,
  duration_days INTEGER,
  duration_nights INTEGER,
  package_type TEXT NOT NULL DEFAULT 'circuito'
    CHECK (package_type IN ('circuito', 'todo_incluido', 'combinado', 'promocion_2x1')),
  price_display_mode TEXT NOT NULL DEFAULT 'bajo_consulta'
    CHECK (price_display_mode IN ('desde', 'bajo_consulta', 'rango')),
  price_from_clp INTEGER,
  price_to_clp INTEGER,
  price_unit TEXT NOT NULL DEFAULT 'per_person'
    CHECK (price_unit IN ('per_person', 'per_couple')),
  included TEXT,
  not_included TEXT,
  region_id UUID REFERENCES regions(id),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  featured_sort_order INTEGER,
  show_in_promociones BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);
CREATE INDEX packages_region_id_idx ON packages (region_id);
CREATE INDEX packages_package_type_idx ON packages (package_type);
CREATE INDEX packages_is_featured_idx ON packages (is_featured) WHERE is_featured;
CREATE INDEX packages_show_in_promociones_idx ON packages (show_in_promociones) WHERE show_in_promociones;

CREATE TABLE package_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_clp INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX package_addons_package_id_idx ON package_addons (package_id);

CREATE TABLE package_room_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  price_adjustment_clp INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX package_room_options_package_id_idx ON package_room_options (package_id);

CREATE TABLE package_itinerary_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  day_number INTEGER,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX package_itinerary_days_package_id_idx ON package_itinerary_days (package_id);

-- Archivos físicos subidos desde `admin` (ver admin/storage/uploads/) — en
-- BD nunca se guarda una URL absoluta, solo id + extensión.
CREATE TABLE images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_extension TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  alt_text TEXT,
  source_url TEXT UNIQUE, -- solo para imágenes migradas desde WordPress (idempotencia del script de migración)
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE package_images (
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (package_id, image_id)
);

CREATE TABLE static_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE, -- 'nosotros' | 'contacto'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

CREATE TABLE static_page_images (
  page_id UUID NOT NULL REFERENCES static_pages(id) ON DELETE CASCADE,
  image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (page_id, image_id)
);

CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  featured_image_id UUID REFERENCES images(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);
