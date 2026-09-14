-- Esquema MySQL 5.7 — portado desde el esquema Postgres ya probado (ver plan
-- histórico en ~/.claude/plans/luminous-prancing-lampson.md). Se crea una
-- sola vez (no hay corredor de migraciones esta vez, es un esquema fijo
-- corrido a mano por `mysql` CLI o phpMyAdmin). IDs son CHAR(36) (formato
-- UUID) generados en PHP antes del INSERT — MySQL 5.7 no soporta DEFAULT de
-- función en columnas (eso es MySQL 8.0.13+).

SET NAMES utf8mb4;

CREATE TABLE regions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(190) NOT NULL,
  role ENUM('super_admin', 'admin_viewer', 'editor') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Sesión = token opaco (este id ES la cookie) — revocación instantánea
-- borrando la fila o poniendo users.is_active = 0. No usamos $_SESSION
-- nativo de PHP para poder controlar roles y revocación igual que en el
-- stack anterior (ya probado).
CREATE TABLE sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(64) NULL,
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (user_id),
  INDEX (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE images (
  id CHAR(36) NOT NULL PRIMARY KEY,
  file_extension VARCHAR(8) NOT NULL,
  original_filename VARCHAR(255) NULL,
  mime_type VARCHAR(64) NOT NULL,
  size_bytes INT NULL,
  alt_text VARCHAR(255) NULL,
  uploaded_by CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT images_uploaded_by_fk FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE packages (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(190) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255) NULL,
  content MEDIUMTEXT NULL,
  duration_days INT NULL,
  duration_nights INT NULL,
  package_type ENUM('circuito', 'todo_incluido', 'combinado', 'promocion_2x1') NOT NULL DEFAULT 'circuito',
  price_display_mode ENUM('desde', 'bajo_consulta', 'rango') NOT NULL DEFAULT 'bajo_consulta',
  price_from_clp INT NULL,
  price_to_clp INT NULL,
  price_unit ENUM('per_person', 'per_couple') NOT NULL DEFAULT 'per_person',
  included MEDIUMTEXT NULL,
  not_included MEDIUMTEXT NULL,
  region_id CHAR(36) NULL,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  featured_sort_order INT NULL,
  show_in_promociones TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'published',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  CONSTRAINT packages_region_fk FOREIGN KEY (region_id) REFERENCES regions(id),
  CONSTRAINT packages_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT packages_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX (region_id),
  INDEX (package_type),
  INDEX (is_featured),
  INDEX (show_in_promociones)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE package_addons (
  id CHAR(36) NOT NULL PRIMARY KEY,
  package_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  price_clp INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT package_addons_package_fk FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  INDEX (package_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE package_room_options (
  id CHAR(36) NOT NULL PRIMARY KEY,
  package_id CHAR(36) NOT NULL,
  label VARCHAR(255) NOT NULL,
  price_adjustment_clp INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT package_room_options_package_fk FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  INDEX (package_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE package_itinerary_days (
  id CHAR(36) NOT NULL PRIMARY KEY,
  package_id CHAR(36) NOT NULL,
  day_number INT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '',
  description MEDIUMTEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT package_itinerary_days_package_fk FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  INDEX (package_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE package_images (
  package_id CHAR(36) NOT NULL,
  image_id CHAR(36) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (package_id, image_id),
  CONSTRAINT package_images_package_fk FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  CONSTRAINT package_images_image_fk FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE static_pages (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by CHAR(36) NULL,
  CONSTRAINT static_pages_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE static_page_images (
  page_id CHAR(36) NOT NULL,
  image_id CHAR(36) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (page_id, image_id),
  CONSTRAINT static_page_images_page_fk FOREIGN KEY (page_id) REFERENCES static_pages(id) ON DELETE CASCADE,
  CONSTRAINT static_page_images_image_fk FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE blog_posts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(190) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  excerpt MEDIUMTEXT NOT NULL,
  content MEDIUMTEXT NOT NULL,
  featured_image_id CHAR(36) NULL,
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  CONSTRAINT blog_posts_image_fk FOREIGN KEY (featured_image_id) REFERENCES images(id) ON DELETE SET NULL,
  CONSTRAINT blog_posts_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT blog_posts_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cotizaciones — igual que la tabla ya probada en Postgres, sin la columna
-- redundante `selected_addon_ids` (ya estaba duplicando `selected_addons_json`).
CREATE TABLE quote_requests (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  package_id CHAR(36) NULL,
  package_slug VARCHAR(190) NOT NULL,
  package_title VARCHAR(255) NOT NULL,

  adults INT NOT NULL,
  children INT NOT NULL,
  room_option_id CHAR(36) NULL,
  room_option_label VARCHAR(255) NULL,
  selected_addons_json JSON NOT NULL,

  -- Desglose calculado por el SERVIDOR (nunca lo que mandó el navegador) —
  -- ver inc/pricing.php, calculate_quote().
  per_person_base_clp INT NULL,
  passengers_subtotal_clp INT NULL,
  addons_total_clp INT NOT NULL DEFAULT 0,
  room_adjustment_clp INT NOT NULL DEFAULT 0,
  total_clp INT NULL,
  deposit_suggested_clp INT NULL,

  preferred_date_from DATE NULL,
  preferred_date_to DATE NULL,
  passenger_name VARCHAR(255) NOT NULL,
  passenger_email VARCHAR(190) NOT NULL,
  passenger_phone VARCHAR(64) NOT NULL,
  comments MEDIUMTEXT NULL,

  status ENUM('nueva', 'en_proceso', 'ganada', 'perdida') NOT NULL DEFAULT 'nueva',
  internal_notes MEDIUMTEXT NULL,
  assigned_to CHAR(36) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT quote_requests_package_fk FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL,
  CONSTRAINT quote_requests_assigned_to_fk FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO regions (id, slug, name, sort_order) VALUES
  (UUID(), 'europa', 'Europa', 1),
  (UUID(), 'asia', 'Asia', 2),
  (UUID(), 'america', 'América', 3),
  (UUID(), 'medio-oriente', 'Medio Oriente', 4),
  (UUID(), 'africa', 'África', 5),
  (UUID(), 'combinados', 'Combinados', 6);
