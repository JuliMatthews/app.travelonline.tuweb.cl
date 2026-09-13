import { Pool } from "pg";

// Postgres compartida entre `web` y `admin` (ver cms/docker-compose.yml,
// servicio `quotes-db`) — hoy solo guarda `quote_requests`, pero a partir de
// la migración fuera de WordPress guarda TODO el contenido (paquetes,
// páginas, blog, usuarios) — mismo motor que se usará en Vercel Postgres al
// desplegar, para no migrar el esquema dos veces.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export { pool };
