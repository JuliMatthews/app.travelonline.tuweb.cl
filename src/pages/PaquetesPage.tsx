import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import type { PackageStatus, PackageSummary } from "@/lib/types";

const STATUS: Record<PackageStatus, { label: string; cls: string }> = {
  draft: { label: "Borrador", cls: "bg-amber-100 text-amber-900" },
  published: { label: "Publicado", cls: "bg-emerald-100 text-emerald-900" },
  archived: { label: "Archivado", cls: "bg-foreground/10 text-foreground/60" },
};
const TIPO: Record<string, string> = { circuito: "Circuito", todo_incluido: "Todo incluido", combinado: "Combinado", promocion_2x1: "Promoción 2x1" };

export default function PaquetesPage() {
  const { user } = useAuth();
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);
  const [filter, setFilter] = useState<PackageStatus | "all">("all");

  useEffect(() => {
    apiGet<{ packages: PackageSummary[] }>("/api-packages.php?action=list").then((res) => {
      if (res.ok) setPackages(res.packages);
    });
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-dark">Paquetes</h1>
        {can(user, "packages:create") && (
          <Link
            to="/paquetes/nuevo"
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Nuevo paquete
          </Link>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por estado">
        {(["all", "draft", "published", "archived"] as const).map((k) => {
          const n = (packages ?? []).filter((p) => k === "all" || p.status === k).length;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === k ? "border-brand bg-brand text-white" : "border-border text-foreground/70 hover:bg-brand-light/40"}`}
            >
              {k === "all" ? "Todos" : STATUS[k].label} ({n})
            </button>
          );
        })}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-foreground/60">
            <tr>
              <th className="px-4 py-3">Título</th>
              <th className="px-4 py-3">Región</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(packages ?? []).filter((p) => filter === "all" || p.status === filter).map((pkg) => (
              <tr key={pkg.id} className="border-b border-border last:border-0 hover:bg-brand-light/30">
                <td className="px-4 py-3">
                  <Link to={`/paquetes/${pkg.id}/editar`} className="font-medium text-brand-dark hover:underline">
                    {pkg.title}
                  </Link>
                  {pkg.subtitle && <p className="text-xs text-foreground/50">{pkg.subtitle}</p>}
                </td>
                <td className="px-4 py-3 text-foreground/70">{pkg.region?.name ?? "—"}</td>
                <td className="px-4 py-3 text-foreground/70">{TIPO[pkg.packageType] ?? pkg.packageType}</td>
                <td className="px-4 py-3 text-foreground/70">
                  {pkg.priceDisplayMode === "desde" && pkg.priceFromClp != null
                    ? `Desde $${pkg.priceFromClp.toLocaleString("es-CL")}`
                    : "Bajo consulta"}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS[pkg.status].cls}`}>{STATUS[pkg.status].label}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {packages && <p className="mt-3 text-xs text-foreground/40">{packages.length} paquetes</p>}
    </div>
  );
}
