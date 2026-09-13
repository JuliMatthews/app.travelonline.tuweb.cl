import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { LogoutButton } from "@/components/LogoutButton";

// Gate autoritativo de todo el dashboard — Server Component, corre en
// runtime Node.js (confirmado en la Fase 0), consulta la sesión real contra
// Postgres. `proxy.ts` solo hace un chequeo barato de "¿existe la cookie?"
// antes de esto, por UX — la barrera de seguridad real es esta de acá.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { user } = session;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-black/10 bg-white p-4">
        <p className="font-display font-bold text-brand-dark">Travelonline</p>
        <div className="mt-1">
          <p className="text-xs text-foreground/70">{user.name}</p>
          <p className="text-xs text-foreground/40">{user.role}</p>
        </div>

        <nav className="mt-6 flex flex-col gap-1 text-sm">
          <Link href="/" className="rounded-lg px-3 py-2 hover:bg-brand-light">
            Inicio
          </Link>
          <Link href="/cotizaciones" className="rounded-lg px-3 py-2 hover:bg-brand-light">
            Cotizaciones
          </Link>
          <Link href="/paquetes" className="rounded-lg px-3 py-2 hover:bg-brand-light">
            Paquetes
          </Link>
          {user.role === "super_admin" && (
            <Link href="/usuarios" className="rounded-lg px-3 py-2 hover:bg-brand-light">
              Usuarios
            </Link>
          )}
        </nav>

        <div className="mt-auto">
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
