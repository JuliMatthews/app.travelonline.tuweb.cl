import Link from "next/link";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listPackages } from "@/lib/packages-repo";

export default async function PaquetesPage() {
  const session = await getSession();
  const packages = await listPackages();
  const canCreate = can(session?.user, "packages:create");

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-brand-dark">Paquetes</h1>
        {canCreate && (
          <Link
            href="/paquetes/nuevo"
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Nuevo paquete
          </Link>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-black/10 text-left text-foreground/60">
            <tr>
              <th className="px-4 py-3">Título</th>
              <th className="px-4 py-3">Región</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((pkg) => (
              <tr key={pkg.id} className="border-b border-black/5 last:border-0 hover:bg-brand-light/30">
                <td className="px-4 py-3">
                  <Link href={`/paquetes/${pkg.id}/editar`} className="font-medium text-brand-dark hover:underline">
                    {pkg.title}
                  </Link>
                  {pkg.subtitle && <p className="text-xs text-foreground/50">{pkg.subtitle}</p>}
                </td>
                <td className="px-4 py-3 text-foreground/70">{pkg.region?.name ?? "—"}</td>
                <td className="px-4 py-3 text-foreground/70">{pkg.packageType}</td>
                <td className="px-4 py-3 text-foreground/70">
                  {pkg.priceDisplayMode === "desde" && pkg.priceFromClp != null
                    ? `Desde $${pkg.priceFromClp.toLocaleString("es-CL")}`
                    : "Bajo consulta"}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-brand-light px-2 py-1 text-xs text-brand-dark">
                    {pkg.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-foreground/40">{packages.length} paquetes</p>
    </div>
  );
}
