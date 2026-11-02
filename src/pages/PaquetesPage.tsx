import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiUpload } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import type { PackageStatus, PackageSummary } from "@/lib/types";

const STATUS: Record<PackageStatus, { label: string; cls: string }> = {
  draft: { label: "Borrador", cls: "bg-amber-100 text-amber-900" },
  published: { label: "Publicado", cls: "bg-emerald-100 text-emerald-900" },
  archived: { label: "Archivado", cls: "bg-foreground/10 text-foreground/60" },
};
const TIPO: Record<string, string> = { circuito: "Circuito", todo_incluido: "Todo incluido", combinado: "Combinado", promocion_2x1: "Promoción 2x1" };
const GAP: Record<string, string> = {
  descripcion: "descripción", precio: "precio", dias: "días y noches", incluye: "qué incluye", no_incluye: "qué no incluye", itinerario: "itinerario",
};

type ImportRow = { row: number; name: string; action: "create" | "update" | "error"; changes: string[]; errors: string[] };
type ImportReport = {
  applied: boolean;
  counts: { create: number; update: number; same: number; error: number };
  rows: ImportRow[];
  orphans: { sheet: string; row: number; msg: string }[];
};

export default function PaquetesPage() {
  const { user } = useAuth();
  const canEdit = can(user, "packages:edit");
  const [packages, setPackages] = useState<PackageSummary[] | null>(null);
  const [filter, setFilter] = useState<PackageStatus | "all">("all");
  const [gapFilter, setGapFilter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    apiGet<{ packages: PackageSummary[] }>("/api-packages.php?action=list").then((res) => {
      if (res.ok) setPackages(res.packages);
    });
  }, []);
  useEffect(load, [load]);

  async function preview(f: File) {
    setBusy(true);
    setMsg(null);
    setReport(null);
    const res = await apiUpload<ImportReport>("/api-packages-excel.php?action=import", f);
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setFile(f);
    setReport(res);
  }

  async function apply() {
    if (!file) return;
    setBusy(true);
    const res = await apiUpload<ImportReport>("/api-packages-excel.php?action=import&apply=1", file);
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setReport(null);
    setFile(null);
    setMsg({ ok: true, text: `Listo: ${res.counts.update} programa(s) actualizado(s) y ${res.counts.create} nuevo(s) creado(s) en borrador.${res.counts.error ? ` ${res.counts.error} fila(s) con error no se aplicaron.` : ""}` });
    load();
  }

  const all = packages ?? [];
  const complete = all.filter((p) => (p.gaps ?? []).length === 0).length;
  const gapCount = (k: string) => all.filter((p) => (p.gaps ?? []).includes(k)).length;
  const shown = all.filter((p) => (filter === "all" || p.status === filter) && (gapFilter === "" || (gapFilter === "any" ? (p.gaps ?? []).length > 0 : (p.gaps ?? []).includes(gapFilter))));
  const pct = all.length ? Math.round((complete / all.length) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-dark">Paquetes</h1>
        {can(user, "packages:create") && (
          <Link to="/paquetes/nuevo" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
            Nuevo paquete
          </Link>
        )}
      </div>

      {all.length > 0 && (
        <div className="crm-panel mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2>Qué tan completos están los programas</h2>
              <p className="mt-1 text-[13px] text-[color:var(--muted)]">
                <b>{complete}</b> de <b>{all.length}</b> programas tienen todos los datos ({pct}%). Lo que falta se ve en la columna "Falta" y en el Excel para completar.
              </p>
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <a className="crm-btn primary" href="/api-packages-excel.php?action=export">Descargar Excel para completar</a>
                <button type="button" className="crm-btn" disabled={busy} onClick={() => fileRef.current?.click()}>Subir Excel completado</button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) preview(f);
                  }}
                />
              </div>
            )}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 text-[12.5px] text-[color:var(--muted)]">
            Sin: {Object.keys(GAP).map((k) => `${GAP[k]} (${gapCount(k)})`).join(" · ")}
          </p>
        </div>
      )}

      {msg && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-[13px] font-semibold ${msg.ok ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`} role="status">{msg.text}</p>
      )}

      {report && (
        <div className="crm-panel mt-4">
          <h2>Revisa antes de aplicar</h2>
          <p className="mt-1 text-[13px]">
            <b>{report.counts.update}</b> programa(s) se actualizarían · <b>{report.counts.create}</b> nuevo(s) en borrador · {report.counts.same} sin cambios
            {report.counts.error > 0 && <> · <b className="text-red-700">{report.counts.error} con error (no se aplicarán)</b></>}.
            Todavía no se cambió nada.
          </p>
          <ul className="mt-3 max-h-[320px] space-y-1.5 overflow-y-auto text-[13px]">
            {report.rows.map((r) => (
              <li key={r.row} className="rounded-lg border border-border px-3 py-2">
                <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${r.action === "error" ? "bg-red-100 text-red-900" : r.action === "create" ? "bg-sky-100 text-sky-900" : "bg-emerald-100 text-emerald-900"}`}>
                  {r.action === "error" ? "Error" : r.action === "create" ? "Nuevo" : "Actualiza"}
                </span>
                <b>{r.name || `Fila ${r.row}`}</b> <span className="text-foreground/50">(fila {r.row})</span>
                {r.errors.map((e, i) => <p key={i} className="mt-1 text-red-700">⚠ {e}</p>)}
                {r.changes.length > 0 && <p className="mt-1 text-foreground/70">Cambia: {r.changes.join(", ")}</p>}
              </li>
            ))}
            {report.orphans.map((o, i) => (
              <li key={`o${i}`} className="rounded-lg border border-border px-3 py-2 text-red-700">⚠ Hoja {o.sheet}, fila {o.row}: {o.msg}</li>
            ))}
            {report.rows.length === 0 && report.orphans.length === 0 && <li className="text-foreground/60">No hay cambios en este archivo.</li>}
          </ul>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" className="crm-btn" onClick={() => { setReport(null); setFile(null); }}>Cancelar</button>
            <button type="button" className="crm-btn primary" disabled={busy || report.counts.update + report.counts.create === 0} onClick={apply}>
              Aplicar {report.counts.update + report.counts.create} cambio(s)
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Filtrar por estado">
        {(["all", "draft", "published", "archived"] as const).map((k) => {
          const n = all.filter((p) => k === "all" || p.status === k).length;
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
        <select className="crm-field ml-auto" style={{ width: "auto" }} value={gapFilter} onChange={(e) => setGapFilter(e.target.value)} aria-label="Filtrar por lo que falta">
          <option value="">Falta: todos</option>
          <option value="any">Con algún dato faltante ({all.length - complete})</option>
          {Object.keys(GAP).map((k) => <option key={k} value={k}>Sin {GAP[k]} ({gapCount(k)})</option>)}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-foreground/60">
            <tr>
              <th className="px-4 py-3">Título</th>
              <th className="px-4 py-3">Región</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Falta</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((pkg) => (
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
                  {(pkg.gaps ?? []).length === 0 ? (
                    <span className="text-xs font-semibold text-emerald-700">✓ Completo</span>
                  ) : (
                    <span className="text-xs text-amber-800" title={(pkg.gaps ?? []).map((g) => GAP[g]).join(", ")}>
                      {(pkg.gaps ?? []).slice(0, 2).map((g) => GAP[g]).join(", ")}
                      {(pkg.gaps ?? []).length > 2 ? ` +${(pkg.gaps ?? []).length - 2}` : ""}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS[pkg.status].cls}`}>{STATUS[pkg.status].label}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {packages && <p className="mt-3 text-xs text-foreground/40">{shown.length} de {packages.length} paquetes</p>}
    </div>
  );
}
