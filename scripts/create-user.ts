// Bootstrap de cuentas — no hay auto-registro público (login cerrado por
// allowlist, ver plan). Sirve tanto para crear la primera cuenta super_admin
// (problema huevo-y-gallina: el dashboard exige login para crear usuarios)
// como para resetear una contraseña desde la línea de comandos.
// Uso: pnpm create-user <email> <password> "<nombre>" <super_admin|admin_viewer|editor>
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(scriptDir, "..", ".env.local"));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ROLES = ["super_admin", "admin_viewer", "editor"] as const;

const [, , email, password, name, role] = process.argv;

if (!email || !password || !name || !role) {
  console.error(
    'Uso: pnpm create-user <email> <password> "<nombre>" <super_admin|admin_viewer|editor>'
  );
  process.exit(1);
}

if (!ROLES.includes(role as (typeof ROLES)[number])) {
  console.error(`Rol inválido: "${role}". Debe ser uno de: ${ROLES.join(", ")}`);
  process.exit(1);
}

async function main() {
  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       name = EXCLUDED.name,
       role = EXCLUDED.role,
       is_active = true
     RETURNING id, email, name, role`,
    [email, passwordHash, name, role]
  );
  console.log("Usuario creado/actualizado:", rows[0]);
  await pool.end();
}

main();
