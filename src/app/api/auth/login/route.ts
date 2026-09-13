import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";
import { createSession, SESSION_COOKIE } from "@/lib/session";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = LoginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: "Datos inválidos" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const { rows } = await pool.query(
    "SELECT id, password_hash, is_active FROM users WHERE email = $1",
    [email]
  );

  // Mismo mensaje genérico tanto si el correo no existe como si la
  // contraseña es incorrecta — no revelar cuáles correos están registrados.
  const genericError = () =>
    NextResponse.json({ message: "Correo o contraseña incorrectos" }, { status: 401 });

  if (rows.length === 0 || !rows[0].is_active) {
    return genericError();
  }

  const valid = await bcrypt.compare(password, rows[0].password_hash);
  if (!valid) {
    return genericError();
  }

  const userId = rows[0].id as string;
  const session = await createSession(userId, {
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for"),
  });
  await pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [userId]);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: session.expiresAt,
    path: "/",
  });
  return response;
}
