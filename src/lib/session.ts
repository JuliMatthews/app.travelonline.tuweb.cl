import { cache } from "react";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import type { User } from "@/lib/types";
import { SESSION_COOKIE } from "@/lib/session-cookie";

export { SESSION_COOKIE };
const SESSION_DAYS = 7;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null }
): Promise<{ id: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const { rows } = await pool.query(
    `INSERT INTO sessions (user_id, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, expiresAt, meta.userAgent ?? null, meta.ip ?? null]
  );
  return { id: rows[0].id as string, expiresAt };
}

export async function destroySession(sessionId: string): Promise<void> {
  await pool.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
}

// Gate autoritativo — SIEMPRE consulta la base (sesión + usuario activo),
// nunca confía solo en que la cookie exista. `cache()` de React 19 evita
// repetir la consulta si varios Server Components la llaman en el mismo
// request (ej. el layout del dashboard y una página hija).
export const getSession = cache(async (): Promise<{ sessionId: string; user: User } | null> => {
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionId || !UUID_RE.test(sessionId)) return null;

  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.is_active
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now() AND u.is_active`,
    [sessionId]
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    sessionId,
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      isActive: row.is_active,
    },
  };
});
