-- Siembra única de las 6 regiones fijas (mismos slugs/nombres que la
-- taxonomía `region` de WordPress y que web/src/lib/regions.ts). Sin
-- pantalla de administración para esto — fuera de alcance de este plan.
INSERT INTO regions (slug, name, sort_order) VALUES
  ('europa', 'Europa', 1),
  ('asia', 'Asia', 2),
  ('america', 'América', 3),
  ('medio-oriente', 'Medio Oriente', 4),
  ('africa', 'África', 5),
  ('combinados', 'Combinados', 6)
ON CONFLICT (slug) DO NOTHING;
