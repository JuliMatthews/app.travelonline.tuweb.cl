import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";
import type { Role, UserRow } from "@/lib/types";

export async function listUsers(): Promise<UserRow[]> {
  const { rows } = await pool.query(
    "SELECT id, email, name, role, is_active, last_login_at FROM users ORDER BY name"
  );
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at ? (row.last_login_at as Date).toISOString() : null,
  }));
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const { rows } = await pool.query(
    "SELECT id, email, name, role, is_active, last_login_at FROM users WHERE id = $1",
    [id]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at ? (row.last_login_at as Date).toISOString() : null,
  };
}

export async function createUser(input: {
  email: string;
  password: string;
  name: string;
  role: Role;
}): Promise<string> {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING id`,
    [input.email, passwordHash, input.name, input.role]
  );
  return rows[0].id as string;
}

export async function updateUser(
  id: string,
  input: { name: string; role: Role; isActive: boolean; newPassword: string }
): Promise<void> {
  if (input.newPassword) {
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await pool.query(
      "UPDATE users SET name = $1, role = $2, is_active = $3, password_hash = $4 WHERE id = $5",
      [input.name, input.role, input.isActive, passwordHash, id]
    );
  } else {
    await pool.query("UPDATE users SET name = $1, role = $2, is_active = $3 WHERE id = $4", [
      input.name,
      input.role,
      input.isActive,
      id,
    ]);
  }
  // Si se desactiva la cuenta, cortar cualquier sesión activa al instante —
  // coherente con la promesa de "desactivar bloquea de inmediato" (Fase 2).
  if (!input.isActive) {
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [id]);
  }
}
