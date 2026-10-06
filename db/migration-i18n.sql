-- Traducciones EN/PT para el contenido público. El español sigue siendo la
-- fuente canónica en las tablas base (packages, blog_posts, static_pages,
-- package_itinerary_days) — estas tablas solo guardan lo que cambia por
-- idioma, y un campo NULL/ausente cae automáticamente al español (ver
-- inc/content.php, locale_coalesce()). `is_machine_translated` distingue un
-- borrador generado por la API gratuita de MyMemory de una traducción ya
-- revisada a mano en el panel.

CREATE TABLE package_translations (
  package_id CHAR(36) NOT NULL,
  locale ENUM('en', 'pt') NOT NULL,
  title VARCHAR(255) NULL,
  subtitle VARCHAR(255) NULL,
  content MEDIUMTEXT NULL,
  included MEDIUMTEXT NULL,
  not_included MEDIUMTEXT NULL,
  is_machine_translated TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (package_id, locale),
  CONSTRAINT package_translations_package_fk FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE package_itinerary_day_translations (
  day_id CHAR(36) NOT NULL,
  locale ENUM('en', 'pt') NOT NULL,
  title VARCHAR(255) NULL,
  description MEDIUMTEXT NULL,
  is_machine_translated TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (day_id, locale),
  CONSTRAINT package_itinerary_day_translations_day_fk FOREIGN KEY (day_id) REFERENCES package_itinerary_days(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE package_addon_translations (
  addon_id CHAR(36) NOT NULL,
  locale ENUM('en', 'pt') NOT NULL,
  name VARCHAR(255) NULL,
  is_machine_translated TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (addon_id, locale),
  CONSTRAINT package_addon_translations_addon_fk FOREIGN KEY (addon_id) REFERENCES package_addons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE package_room_option_translations (
  room_option_id CHAR(36) NOT NULL,
  locale ENUM('en', 'pt') NOT NULL,
  label VARCHAR(255) NULL,
  is_machine_translated TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (room_option_id, locale),
  CONSTRAINT package_room_option_translations_room_fk FOREIGN KEY (room_option_id) REFERENCES package_room_options(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE blog_post_translations (
  post_id CHAR(36) NOT NULL,
  locale ENUM('en', 'pt') NOT NULL,
  title VARCHAR(255) NULL,
  excerpt MEDIUMTEXT NULL,
  content MEDIUMTEXT NULL,
  is_machine_translated TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, locale),
  CONSTRAINT blog_post_translations_post_fk FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE static_page_translations (
  page_id CHAR(36) NOT NULL,
  locale ENUM('en', 'pt') NOT NULL,
  title VARCHAR(255) NULL,
  content MEDIUMTEXT NULL,
  is_machine_translated TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (page_id, locale),
  CONSTRAINT static_page_translations_page_fk FOREIGN KEY (page_id) REFERENCES static_pages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
