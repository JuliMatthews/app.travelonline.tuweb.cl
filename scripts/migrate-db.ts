// Corredor de migraciones casero (sin ORM, consistente con el resto del
// proyecto) — el patrón de `cms/quotes-db-init/*.sql` solo corre en un
// volumen Postgres vacío, no sirve para evolucionar el volumen local que ya
// tiene cotizaciones reales. Aplica en orden los .sql de db/migrations/ que
// todavía no estén registrados en `schema_migrations`. Uso: pnpm migrate
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(scriptDir, "..", ".env.local"));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const migrationsDir = path.join(scriptDir, "..", "db", "migrations");

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const appliedRows = await pool.query("SELECT name FROM schema_migrations");
  const applied = new Set(appliedRows.rows.map((r: { name: string }) => r.name));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`ya aplicada: ${file}`);
      continue;
    }

    console.log(`aplicando: ${file} ...`);
    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`  OK`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  FALLÓ: ${file}`);
      console.error(err);
      process.exitCode = 1;
      break;
    } finally {
      client.release();
    }
  }

  await pool.end();
}

main();
