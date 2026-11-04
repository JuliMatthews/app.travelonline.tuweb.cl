import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ClipboardCheck, Compass, Landmark, Layers, List, MapPin, Mountain, Palmtree, Search, Sun, type LucideIcon } from "lucide-react";
import { apiGet, apiPost, apiUpload } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import type { PackageStatus, PackageSummary } from "@/lib/types";

const STATUS: Record<PackageStatus, { label: string; cls: string }> = {
  draft: { label: "Borrador", cls: "bg-amber-100 text-amber-900" },
  published: { label: "Publicado", cls: "bg-emerald-100 text-emerald-900" },
  archived: { label: "Archivado", cls: "bg-foreground/10 text-foreground/60" },
};
const TIPO: Record<string, string> = { circuito: "Circuito", todo_incluido: "Todo incluido", combinado: "Combinado", promocion_2x1: "Promoción 2x1" };
const GAP: Record<string, string> = {
  descripcion: "descripción", precio: "precio", dias: "días y noches", incluye: "qué incluye", no_incluye: "qué no incluye", itinerario: "itinerario", foto: "foto",
};
// Lo mínimo para que un borrador esté "listo para publicar" (el precio no bloquea: puede ir "bajo consulta").
const LISTO_MIN = ["descripcion", "dias", "itinerario", "foto"];

const TIPO_CORTO: Record<string, string> = { circuito: "Circuitos", todo_incluido: "Todo incluido", combinado: "Combinados", promocion_2x1: "Promos 2x1" };
// Orden y apariencia de las tarjetas por región (sobrias: color de acento + ícono).
const REGIONES: { slug: string; name: string; color: string; Icon: LucideIcon }[] = [
  { slug: "europa", name: "Europa", color: "#4f74b3", Icon: Landmark },
  { slug: "asia", name: "Asia", color: "#b8605c", Icon: Mountain },
  { slug: "america", name: "América", color: "#4f8a6b", Icon: Palmtree },
  { slug: "medio-oriente", name: "Medio Oriente", color: "#c28a3b", Icon: Sun },
  { slug: "africa", name: "África", color: "#8a6a4f", Icon: Compass },
  { slug: "combinados", name: "Combinados", color: "#7a6fa8", Icon: Layers },
];
const SIN_REGION = { slug: "sin-region", name: "Sin región", color: "#697285", Icon: MapPin };
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const isSearchOnly = (n: { vista?: string | null; q?: string | null }) => "q" in n && !("vista" in n);

function statsOf(items: PackageSummary[]) {
  const complete = items.filter((p) => (p.gaps ?? []).length === 0).length;
  const byType: Record<string, number> = {};
  items.forEach((p) => { byType[p.packageType] = (byType[p.packageType] ?? 0) + 1; });
  return {
    total: items.length,
    published: items.filter((p) => p.status === "published").length,
    draft: items.filter((p) => p.status === "draft").length,
    archived: items.filter((p) => p.status === "archived").length,
    complete,
    pct: items.length ? Math.round((complete / items.length) * 100) : 0,
    byType,
    ready: items.filter((p) => p.status === "draft" && !(p.gaps ?? []).some((g) => LISTO_MIN.includes(g))).length,
    noPhoto: items.filter((p) => (p.gaps ?? []).includes("foto")).length,
    quotes: items.reduce((n, p) => n + (p.quotes30 ?? 0), 0),
    expired: items.filter((p) => p.tariffExpired).length,
  };
}

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
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  // Sin ?vista= se ven las tarjetas por región; escribir en el buscador lleva a la lista completa.
  const vista = params.get("vista") ?? (q ? "todos" : null);
  const go = (next: { vista?: string | null; q?: string | null }) => {
    const n = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v) n.set(k, v); else n.delete(k); }
    setParams(n, { replace: isSearchOnly(next) });
  };
  const [filter, setFilter] = useState<PackageStatus | "all">("all");
  const [gapFilter, setGapFilter] = useState("");
  const [sort, setSort] = useState<{ key: "title" | "price" | "quotes" | "updated"; dir: 1 | -1 }>({ key: "title", dir: 1 });
  const sortBy = (key: "title" | "price" | "quotes" | "updated") =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "title" ? 1 : -1 }));
  type Observed = { value: number | null; date: string | null; fetchedAt: number | null; failed: boolean; source: string };
  type Pricing = { rate: number | null; step: number; steps: number[]; canManage: boolean; withUsd: number; toUpdate: number; mode: "auto" | "manual"; manualRate: number | null; adjustPct: number; observed: Observed };
  type PriceRow = { id: string; title: string; status: string; operator: string | null; priceUsd: number; markupPct: number; currentClp: number | null; newClp: number | null; changes: boolean };
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [modeInput, setModeInput] = useState<"auto" | "manual">("auto");
  const [adjustInput, setAdjustInput] = useState("0");
  const [stepInput, setStepInput] = useState(1000);
  const [priceRows, setPriceRows] = useState<PriceRow[] | null>(null);
  const [operatorFilter, setOperatorFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSkipped, setBulkSkipped] = useState<{ id: string; title: string; why: string }[]>([]);
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
  const loadPricing = useCallback(() => {
    apiGet<Pricing>("/api-pricing.php?action=settings").then((r) => {
      if (r.ok) { setPricing(r); setRateInput(r.manualRate ? String(r.manualRate) : ""); setStepInput(r.step); setModeInput(r.mode); setAdjustInput(String(r.adjustPct ?? 0)); }
    });
  }, []);
  useEffect(loadPricing, [loadPricing]);

  async function saveRate() {
    setBusy(true);
    const res = await apiPost("/api-pricing.php?action=settings", { mode: modeInput, rate: rateInput.trim() === "" ? null : Number(rateInput.replace(",", ".")), adjustPct: Number(adjustInput.replace(",", ".") || 0), step: stepInput });
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setPriceRows(null);
    setMsg({ ok: true, text: "Ajustes de precio guardados. Los precios en pesos no cambian hasta que los recalcules." });
    loadPricing();
  }
  async function previewPrices(apply: boolean) {
    if (apply && !window.confirm(`Se actualizará el precio en pesos de ${priceRows?.filter((r) => r.changes).length ?? 0} programa(s) con el dólar a $${pricing?.rate?.toLocaleString("es-CL") ?? ""}. ¿Continuar?`)) return;
    setBusy(true);
    const res = await apiPost<{ rows: PriceRow[]; toUpdate: number; applied: number }>("/api-pricing.php?action=recalc", { apply });
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setPriceRows(apply ? null : res.rows);
    if (apply) { setMsg({ ok: true, text: `Listo: ${res.applied} programa(s) con su precio en pesos actualizado. Siguen como estaban de publicados o en borrador.` }); load(); loadPricing(); }
  }

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

  async function bulk(op: "publish" | "draft" | "archive" | "region" | "type", value: string, ids: string[], confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setBulkSkipped([]);
    const res = await apiPost<{ updated: number; requested: number; skipped: { id: string; title: string; why: string }[] }>("/api-packages.php?action=bulk", { ids, op, value });
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setBulkSkipped(res.skipped);
    setSelected(new Set());
    setMsg({ ok: res.skipped.length === 0, text: `${res.updated} programa(s) actualizado(s)${res.skipped.length ? ` · ${res.skipped.length} no se pudieron cambiar (ver abajo)` : ""}.` });
    load();
  }

  const all = packages ?? [];
  const complete = all.filter((p) => (p.gaps ?? []).length === 0).length;
  const gapCount = (k: string) => all.filter((p) => (p.gaps ?? []).includes(k)).length;
  const pct = all.length ? Math.round((complete / all.length) * 100) : 0;

  const groups = [
    ...REGIONES.map((r) => ({ ...r, items: all.filter((p) => p.region?.slug === r.slug) })),
    ...(all.some((p) => !p.region) ? [{ ...SIN_REGION, items: all.filter((p) => !p.region) }] : []),
  ];
  const review = all.filter((p) => p.status === "draft");
  const scopeGroup = groups.find((g) => g.slug === vista);
  const scope = vista === "todos" ? all : vista === "revisar" ? review : scopeGroup ? scopeGroup.items : all;
  const scopeTitle = vista === "todos" ? "Todos los programas" : vista === "revisar" ? "Por revisar (borradores)" : scopeGroup?.name ?? "Todos los programas";
  const nq = norm(q.trim());
  const shown = scope.filter((p) =>
    (filter === "all" || p.status === filter) &&
    (gapFilter === "" || (gapFilter === "any" ? (p.gaps ?? []).length > 0 : (p.gaps ?? []).includes(gapFilter))) &&
    (operatorFilter === "" || (operatorFilter === "none" ? !p.operatorId : String(p.operatorId) === operatorFilter)) &&
    (nq === "" || norm(`${p.title} ${p.subtitle ?? ""}`).includes(nq)),
  ).sort((a, b) => {
    const v = (p: PackageSummary) =>
      sort.key === "title" ? norm(p.title) : sort.key === "price" ? (p.priceDisplayMode === "desde" ? p.priceFromClp ?? 0 : 0) : sort.key === "quotes" ? p.quotes30 ?? 0 : p.updatedAt;
    const x = v(a), y = v(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  });
  // La selección solo cuenta lo que se ve: si cambias de filtro o de región, lo oculto no se toca.
  const picked = shown.filter((p) => selected.has(p.id));
  const allPicked = shown.length > 0 && picked.length === shown.length;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected(allPicked ? new Set() : new Set(shown.map((p) => p.id)));

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

      {pricing && (all.length > 0) && (
        <div className="crm-panel mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-[260px] flex-1">
              <h2>Precios en dólares</h2>
              <p className="mt-1 text-[13px] text-[color:var(--muted)]">
                {pricing.withUsd} programa(s) tienen precio original en USD.{" "}
                {pricing.rate ? <>Se calcula con el dólar a <b>${pricing.rate.toLocaleString("es-CL")}</b>, redondeo a ${pricing.step.toLocaleString("es-CL")}. {pricing.toUpdate > 0 ? <b className="text-amber-700 dark:text-amber-300">{pricing.toUpdate} sin su precio en pesos actualizado.</b> : "Todos al día."}</> : "Sin tipo de cambio disponible, por eso esos programas se ven como «Bajo consulta»."}
              </p>
              <p className="mt-1 text-[12.5px] text-[color:var(--muted)]">
                Dólar observado (Banco Central): <b>{pricing.observed.value ? `$${pricing.observed.value.toLocaleString("es-CL")}` : "no disponible"}</b>
                {pricing.observed.date ? ` · del ${new Date(`${pricing.observed.date}T12:00:00`).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
                {pricing.observed.failed ? " · no se pudo actualizar hoy, se usa el último guardado" : ""}
              </p>
            </div>
            {pricing.canManage && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-[12px] font-semibold">Dólar a usar
                  <select className="crm-field mt-1" style={{ width: "auto" }} value={modeInput} onChange={(e) => setModeInput(e.target.value as "auto" | "manual")}>
                    <option value="auto">Automático (observado de hoy)</option>
                    <option value="manual">Manual (yo lo escribo)</option>
                  </select>
                </label>
                {modeInput === "auto" ? (
                  <label className="text-[12px] font-semibold" title="Un colchón sobre el dólar observado, por si sube entre que cotizas y cobras. 0 = sin ajuste.">Ajuste (%)
                    <input className="crm-field mt-1 w-20" inputMode="decimal" value={adjustInput} onChange={(e) => setAdjustInput(e.target.value)} />
                  </label>
                ) : (
                  <label className="text-[12px] font-semibold">Pesos por dólar
                    <input className="crm-field mt-1 w-28" inputMode="decimal" value={rateInput} onChange={(e) => setRateInput(e.target.value)} placeholder="Ej.: 950" />
                  </label>
                )}
                <label className="text-[12px] font-semibold">Redondear a
                  <select className="crm-field mt-1" style={{ width: "auto" }} value={stepInput} onChange={(e) => setStepInput(Number(e.target.value))}>
                    {pricing.steps.map((s) => <option key={s} value={s}>${s.toLocaleString("es-CL")}</option>)}
                  </select>
                </label>
                <button type="button" className="crm-btn" disabled={busy} onClick={saveRate}>Guardar</button>
                <button type="button" className="crm-btn primary" disabled={busy || !pricing.rate} onClick={() => previewPrices(false)}>Calcular precios en pesos…</button>
              </div>
            )}
          </div>
          {priceRows && (
            <div className="mt-3">
              <p className="text-[13px]">Vista previa: <b>{priceRows.filter((r) => r.changes).length}</b> de {priceRows.length} programas cambiarían. Todavía no se guardó nada.</p>
              <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-border">
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0 bg-surface text-left text-foreground/60"><tr><th className="px-3 py-2">Programa</th><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2 text-right">USD</th><th className="px-3 py-2 text-right">Margen</th><th className="px-3 py-2 text-right">Hoy</th><th className="px-3 py-2 text-right">Nuevo (CLP)</th></tr></thead>
                  <tbody>
                    {priceRows.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-3 py-1.5">{r.title}{r.status === "published" && <span className="ml-1 rounded bg-emerald-100 px-1 text-[10.5px] font-bold text-emerald-900">publicado</span>}</td>
                        <td className="px-3 py-1.5 text-foreground/60">{r.operator ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right">{r.priceUsd.toLocaleString("es-CL")}</td>
                        <td className="px-3 py-1.5 text-right">{r.markupPct ? `+${r.markupPct}%` : "—"}</td>
                        <td className="px-3 py-1.5 text-right text-foreground/60">{r.currentClp != null ? `$${r.currentClp.toLocaleString("es-CL")}` : "—"}</td>
                        <td className={`px-3 py-1.5 text-right font-semibold ${r.changes ? "text-brand-dark" : "text-foreground/40"}`}>{r.newClp != null ? `$${r.newClp.toLocaleString("es-CL")}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className="crm-btn" onClick={() => setPriceRows(null)}>Cancelar</button>
                <button type="button" className="crm-btn primary" disabled={busy || priceRows.filter((r) => r.changes).length === 0} onClick={() => previewPrices(true)}>Aplicar {priceRows.filter((r) => r.changes).length} precio(s)</button>
              </div>
            </div>
          )}
        </div>
      )}

      {msg && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-[13px] font-semibold ${msg.ok ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`} role="status">{msg.text}</p>
      )}

      {bulkSkipped.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="font-semibold">No se publicaron porque les falta lo mínimo:</p>
          <ul className="mt-1 list-disc pl-5">
            {bulkSkipped.slice(0, 15).map((s) => <li key={s.id}>{s.title} — {s.why}</li>)}
            {bulkSkipped.length > 15 && <li>…y {bulkSkipped.length - 15} más</li>}
          </ul>
        </div>
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

      {!packages ? (
        <p className="mt-6 text-sm text-foreground/50">Cargando…</p>
      ) : vista === null ? (
        <section className="mt-5" aria-label="Programas por región">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" aria-hidden />
              <input
                type="search"
                className="crm-field w-full"
                style={{ paddingLeft: 34 }}
                placeholder="Buscar un programa por nombre…"
                value={q}
                onChange={(e) => go({ q: e.target.value || null })}
                aria-label="Buscar programa"
              />
            </div>
            <Link to="/paquetes?vista=todos" className="crm-btn primary inline-flex items-center gap-2"><List size={15} aria-hidden /> Ver todos ({all.length})</Link>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {review.length > 0 && (
              <Link
                to="/paquetes?vista=revisar"
                className="group rounded-xl border border-dashed border-amber-500/60 bg-amber-50 p-4 transition hover:shadow-md dark:bg-amber-500/10 sm:col-span-2 xl:col-span-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300"><ClipboardCheck size={20} aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-brand-dark">Por revisar <span className="font-normal text-foreground/60">· {review.length} borradores</span></p>
                    <p className="text-[13px] text-foreground/65">Programas cargados que aún no se publican. <b>{statsOf(review).ready}</b> están listos para publicar (con descripción, días, itinerario y foto); a los demás les falta alguno de esos datos.</p>
                  </div>
                  <span className="text-sm font-semibold text-amber-800 group-hover:underline dark:text-amber-300">Revisar →</span>
                </div>
              </Link>
            )}
            {groups.map((g) => {
              const s = statsOf(g.items);
              const types = Object.entries(s.byType).sort((a, b) => b[1] - a[1]);
              return (
                <Link
                  key={g.slug}
                  to={`/paquetes?vista=${g.slug}`}
                  className="group relative overflow-hidden rounded-xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                  style={{ borderTop: `4px solid ${g.color}` }}
                  aria-label={`${g.name}: ${s.total} programas`}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${g.color} 16%, transparent)`, color: g.color }}>
                      <g.Icon size={20} aria-hidden />
                    </span>
                    <h2 className="flex-1 text-lg font-bold text-brand-dark">{g.name}</h2>
                    <span className="text-right leading-none">
                      <span className="block text-3xl font-bold text-brand-dark">{s.total}</span>
                      <span className="text-[11px] uppercase tracking-wide text-foreground/50">{s.total === 1 ? "programa" : "programas"}</span>
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11.5px] font-semibold">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900">{s.published} publicados</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{s.draft} borradores</span>
                    {s.expired > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-900">{s.expired} tarifa(s) vencida(s)</span>}
                    {s.archived > 0 && <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-foreground/60">{s.archived} archivados</span>}
                  </div>

                  <p className="mt-3 min-h-[2.25rem] text-[12.5px] leading-snug text-foreground/65">
                    {types.length === 0 ? "Sin programas todavía." : types.map(([k, n]) => `${TIPO_CORTO[k] ?? k} ${n}`).join(" · ")}
                  </p>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11.5px] text-foreground/60">
                      <span>Listos para publicar</span>
                      <span className="font-semibold">{s.draft === 0 ? (s.total ? "Todo publicado ✓" : "—") : `${s.ready} de ${s.draft} borradores`}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                      <div className="h-full rounded-full" style={{ width: `${s.draft === 0 ? (s.total ? 100 : 0) : Math.round((s.ready / s.draft) * 100)}%`, background: g.color }} />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                    <span className={s.noPhoto > 0 ? "font-semibold text-amber-700 dark:text-amber-300" : "text-foreground/50"}>
                      {s.noPhoto > 0 ? `📷 ${s.noPhoto} sin foto` : "📷 Todos con foto"}
                    </span>
                    <span className="text-foreground/60" title="Solicitudes de cotización de los últimos 30 días que mencionan programas de esta región">
                      {s.quotes} {s.quotes === 1 ? "cotización" : "cotizaciones"} · 30 días
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="mt-5" aria-label={scopeTitle}>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/paquetes" className="crm-btn inline-flex items-center gap-2"><ArrowLeft size={15} aria-hidden /> Regiones</Link>
            <h2 className="text-lg font-bold text-brand-dark">{scopeTitle} <span className="text-sm font-normal text-foreground/50">({scope.length})</span></h2>
            {vista !== "todos" && <Link to="/paquetes?vista=todos" className="text-[13px] font-semibold text-brand hover:underline">Ver todos ({all.length})</Link>}
            <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-sm">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" aria-hidden />
              <input
                type="search"
                className="crm-field w-full"
                style={{ paddingLeft: 34 }}
                placeholder="Buscar por nombre…"
                value={q}
                onChange={(e) => go({ q: e.target.value || null })}
                aria-label="Buscar programa"
              />
            </div>
          </div>
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
        <select className="crm-field ml-auto" style={{ width: "auto" }} value={operatorFilter} onChange={(e) => setOperatorFilter(e.target.value)} aria-label="Filtrar por proveedor">
          <option value="">Proveedor: todos</option>
          <option value="none">Sin proveedor ({all.filter((p) => !p.operatorId).length})</option>
          {Array.from(new Map(all.filter((p) => p.operatorId).map((p) => [String(p.operatorId), p.operatorName])).entries()).map(([id, name]) => <option key={id} value={id}>{name} ({all.filter((p) => String(p.operatorId) === id).length})</option>)}
        </select>
        <select className="crm-field" style={{ width: "auto" }} value={gapFilter} onChange={(e) => setGapFilter(e.target.value)} aria-label="Filtrar por lo que falta">
          <option value="">Falta: todos</option>
          <option value="any">Con algún dato faltante ({all.length - complete})</option>
          {Object.keys(GAP).map((k) => <option key={k} value={k}>Sin {GAP[k]} ({gapCount(k)})</option>)}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-foreground/60">
            <tr>
              {canEdit && (
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="Seleccionar todos los que se ven" />
                </th>
              )}
              {([["title", "Título"], ["", "Región"], ["", "Tipo"], ["price", "Precio"]] as const).map(([k, label]) => (
                <th key={label} className="px-4 py-3">
                  {k ? <button type="button" className="font-semibold hover:text-brand-dark" onClick={() => sortBy(k)}>{label}{sort.key === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button> : label}
                </th>
              ))}
              <th className="px-4 py-3">Falta</th>
              <th className="px-4 py-3"><button type="button" className="font-semibold hover:text-brand-dark" onClick={() => sortBy("quotes")} title="Solicitudes de los últimos 30 días">Cotiz. 30 d{sort.key === "quotes" ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button></th>
              <th className="px-4 py-3"><button type="button" className="font-semibold hover:text-brand-dark" onClick={() => sortBy("updated")}>Actualizado{sort.key === "updated" ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button></th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-foreground/50">No hay programas que coincidan.{q ? " Prueba con otra palabra." : ""}</td></tr>
            )}
            {shown.map((pkg) => (
              <tr key={pkg.id} className={`border-b border-border last:border-0 hover:bg-brand-light/30 ${selected.has(pkg.id) ? "bg-brand-light/50" : ""}`}>
                {canEdit && (
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(pkg.id)} onChange={() => toggle(pkg.id)} aria-label={`Seleccionar ${pkg.title}`} />
                  </td>
                )}
                <td className="px-4 py-3">
                  <Link to={`/paquetes/${pkg.id}/editar`} className="font-medium text-brand-dark hover:underline">
                    {pkg.title}
                  </Link>
                  {pkg.subtitle && <p className="text-xs text-foreground/50">{pkg.subtitle}</p>}
                  {(pkg.operatorName || pkg.nextDeparture || pkg.tariffExpired) && (
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-foreground/50">
                      {pkg.operatorName && <span>{pkg.operatorName}</span>}
                      {pkg.nextDeparture ? <span>· próx. salida {new Date(`${pkg.nextDeparture}T12:00:00`).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}</span> : pkg.departuresText ? <span>· {pkg.departuresText}</span> : null}
                      {pkg.tariffExpired && <span className="rounded bg-red-100 px-1 font-bold text-red-900">tarifa vencida</span>}
                    </p>
                  )}
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
                <td className="px-4 py-3 text-foreground/70">{(pkg.quotes30 ?? 0) > 0 ? <b className="text-brand-dark">{pkg.quotes30}</b> : <span className="text-foreground/30">0</span>}</td>
                <td className="px-4 py-3 text-xs text-foreground/60">{new Date(pkg.updatedAt.replace(" ", "T")).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS[pkg.status].cls}`}>{STATUS[pkg.status].label}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && picked.length > 0 && (
        <div className="sticky bottom-3 z-10 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand bg-surface px-4 py-3 shadow-lg" role="region" aria-label="Acciones sobre los seleccionados">
          <span className="text-sm font-semibold text-brand-dark">{picked.length} seleccionado{picked.length === 1 ? "" : "s"}</span>
          <button type="button" className="crm-btn primary" disabled={busy}
            onClick={() => bulk("publish", "", picked.map((p) => p.id), `¿Publicar ${picked.length} programa(s)? Se verán en el sitio público. Los que no tengan descripción, días, itinerario y foto se saltarán.`)}>Publicar</button>
          <button type="button" className="crm-btn" disabled={busy}
            onClick={() => bulk("draft", "", picked.map((p) => p.id), `¿Pasar ${picked.length} programa(s) a borrador? Dejarán de verse en el sitio público.`)}>Pasar a borrador</button>
          <button type="button" className="crm-btn" disabled={busy}
            onClick={() => bulk("archive", "", picked.map((p) => p.id), `¿Archivar ${picked.length} programa(s)? Dejarán de verse en el sitio público.`)}>Archivar</button>
          <select className="crm-field" style={{ width: "auto" }} disabled={busy} value="" aria-label="Cambiar región"
            onChange={(e) => { const r = REGIONES.find((x) => x.slug === e.target.value); if (r) bulk("region", r.slug, picked.map((p) => p.id), `¿Mover ${picked.length} programa(s) a ${r.name}?`); }}>
            <option value="">Cambiar región…</option>
            {REGIONES.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
          </select>
          <select className="crm-field" style={{ width: "auto" }} disabled={busy} value="" aria-label="Cambiar tipo"
            onChange={(e) => { const k = e.target.value; if (k) bulk("type", k, picked.map((p) => p.id), `¿Cambiar el tipo de ${picked.length} programa(s) a "${TIPO[k]}"?`); }}>
            <option value="">Cambiar tipo…</option>
            {Object.entries(TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="button" className="ml-auto text-[13px] font-semibold text-foreground/60 hover:underline" onClick={() => setSelected(new Set())}>Quitar selección</button>
        </div>
      )}
      <p className="mt-3 text-xs text-foreground/40">{shown.length} de {scope.length} programas{vista !== "todos" ? ` en ${scopeTitle}` : ""}</p>
        </section>
      )}
    </div>
  );
}
