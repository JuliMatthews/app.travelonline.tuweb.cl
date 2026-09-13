import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

// Chequeo barato — solo mira si existe la cookie, sin tocar la base. La
// barrera de seguridad real vive en (dashboard)/layout.tsx (Server
// Component, consulta la sesión de verdad). Esto es solo para no renderizar
// nada cuando es obvio que no hay sesión.
export function proxy(request: NextRequest) {
  const hasCookie = request.cookies.has(SESSION_COOKIE);
  const isLoginPage = request.nextUrl.pathname.startsWith("/login");

  if (!hasCookie && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
