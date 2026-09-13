import { getSession } from "@/lib/session";

export default async function DashboardHome() {
  const session = await getSession();
  const user = session!.user;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-brand-dark">Hola, {user.name}</h1>
      <p className="mt-2 text-foreground/60">
        Rol: <span className="font-medium">{user.role}</span>
      </p>
      <p className="mt-6 text-sm text-foreground/50">
        Cotizaciones y paquetes se habilitan en las próximas fases del panel.
      </p>
    </div>
  );
}
