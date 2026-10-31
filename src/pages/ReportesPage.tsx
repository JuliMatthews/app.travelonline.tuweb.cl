import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { BRAND_LABEL, BRAND_ORDER, clp, clpShort, fecha } from "@/lib/crm";
import { BrandBadge, Kpi } from "@/components/crm/ui";
import type { Report, ReportGroup } from "@/lib/types";

const pctTxt = (n: number) => `${n.toLocaleString("es-CL", { maximumFractionDigits: 2 })}%`;

// Reportes y comisiones: ventas cerradas, comisión bruta del operador y su reparto
// (ejecutiva · gestión · agencia, % editables).
export default function ReportesPage() {
  const [f, setF] = useState({ from: "", to: "", operatorId: "", ownerId: "", brand: "" });
  const [data, setData] = useState<Report | null>(null);
  const [split, setSplit] = useState({ executive: "20", management: "5" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const query = Object.entries(f).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

  const load = useCallback(() => {
    apiGet<Report>(`/api-reports.php?${query}`).then((res) => {
      if (!res.ok) return;
      setData(res);
      setSplit({ executive: String(res.split.executive), management: String(res.split.management) });
    });
  }, [query]);

  useEffect(load, [load]);

  async function saveSplit() {
    const res = await apiPost("/api-reports.php?action=save_split", { executive: Number(split.executive.replace(",", ".")), management: Number(split.management.replace(",", ".")) });
    setMsg(res.ok ? { ok: true, text: "Reparto actualizado." } : { ok: false, text: res.error });
    if (res.ok) load();
  }

  const agencyPct = Math.round((100 - Number(split.executive.replace(",", ".")) - Number(split.management.replace(",", "."))) * 100) / 100;
  const t = data?.totals;
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });

  const groupTable = (title: string, rows: ReportGroup[]) => (
    <div className="crm-panel">
      <div className="crm-section !mt-0 !border-0 !pt-0">{title}</div>
      <table className="crm-table">
        <thead>
          <tr><th>Nombre</th><th className="num">Ventas</th><th className="num">Vendido</th><th className="num">Comisión bruta</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}><td><b>{r.name}</b></td><td className="num">{r.sales}</td><td className="num">{clp(r.saleClp)}</td><td className="num">{clp(r.grossClp)}</td></tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="crm-empty">Sin datos.</p>}
    </div>
  );

  return (
    <div>
      <div className="crm-head">
        <div>
          <h1>Reportes y comisiones</h1>
          <p>Ventas cerradas · {t ? `${t.sales} venta${t.sales === 1 ? "" : "s"}` : "cargando…"}</p>
        </div>
        <a className="crm-btn" href={`/api-reports.php?action=export&${query}`}>
          <Download size={15} /> Exportar a Excel (CSV)
        </a>
      </div>

      <div className="crm-filters">
        <label className="text-[12px] font-semibold">Desde <input type="date" className="crm-field" value={f.from} onChange={(e) => set("from", e.target.value)} /></label>
        <label className="text-[12px] font-semibold">Hasta <input type="date" className="crm-field" value={f.to} onChange={(e) => set("to", e.target.value)} /></label>
        <select className="crm-field" value={f.operatorId} onChange={(e) => set("operatorId", e.target.value)} aria-label="Operador">
          <option value="">Todos los operadores</option>
          <option value="none">Sin operador</option>
          {data?.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select className="crm-field" value={f.ownerId} onChange={(e) => set("ownerId", e.target.value)} aria-label="Responsable">
          <option value="">Todo el equipo</option>
          {data?.owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select className="crm-field" value={f.brand} onChange={(e) => set("brand", e.target.value)} aria-label="Marca">
          <option value="">Ambas marcas</option>
          {BRAND_ORDER.map((b) => <option key={b} value={b}>{BRAND_LABEL[b]}</option>)}
        </select>
        {Object.values(f).some(Boolean) && <button type="button" className="crm-btn" onClick={() => setF({ from: "", to: "", operatorId: "", ownerId: "", brand: "" })}>Limpiar filtros</button>}
      </div>

      {t && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Kpi label="Total vendido" value={clpShort(t.saleClp)} note={`${t.sales} ventas`} tone="ok" />
          <Kpi label="Comisión bruta" value={clpShort(t.grossClp)} note="Según % de cada operador" tone="mar" />
          <Kpi label={`Ejecutiva (${pctTxt(data!.split.executive)})`} value={clpShort(t.executiveClp)} note="Para quien cierra la venta" />
          <Kpi label={`Gestión (${pctTxt(data!.split.management)})`} value={clpShort(t.managementClp)} note="Gestión y seguimiento" />
          <Kpi label={`Agencia (${pctTxt(data!.split.agency)})`} value={clpShort(t.agencyClp)} note="Queda en la agencia" tone="acento" />
        </div>
      )}
      {t && t.withoutOperator > 0 && (
        <p className="mb-4 rounded-lg bg-[var(--rosa-050)] px-3 py-2 text-[12.5px] font-semibold text-[color:var(--risk)]">
          {t.withoutOperator} venta{t.withoutOperator === 1 ? "" : "s"} sin operador: no suman comisión hasta que se asigne uno en la solicitud.
        </p>
      )}

      {data?.canEditSplit && (
        <div className="crm-panel mb-4">
          <div className="crm-section !mt-0 !border-0 !pt-0">Reparto de la comisión (editable)</div>
          <div className="flex flex-wrap items-end gap-3 text-[12.5px] font-semibold">
            <label>Ejecutiva % <input className="crm-field" style={{ width: 90 }} inputMode="decimal" value={split.executive} onChange={(e) => setSplit({ ...split, executive: e.target.value })} /></label>
            <label>Gestión % <input className="crm-field" style={{ width: 90 }} inputMode="decimal" value={split.management} onChange={(e) => setSplit({ ...split, management: e.target.value })} /></label>
            <span className="pb-2">Agencia: {pctTxt(agencyPct)}</span>
            <button type="button" className="crm-btn primary" onClick={saveSplit}>Guardar reparto</button>
            {msg && <span className={msg.ok ? "text-[color:var(--ok)]" : "text-[color:var(--risk)]"}>{msg.text}</span>}
          </div>
        </div>
      )}

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Folio</th><th>Cierre</th><th>Pasajero</th><th>Destino</th><th>Marca</th><th>Operador</th>
              <th className="num">Venta</th><th className="num">% com.</th><th className="num">Bruta</th><th className="num">Ejecutiva</th><th className="num">Gestión</th><th className="num">Agencia</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-[12px] text-[color:var(--muted)]">{r.folio}</td>
                <td className="whitespace-nowrap">{fecha(r.closedAt)}</td>
                <td><b>{r.passengerName}</b><span className="sub">{r.ownerName ?? "Sin asignar"}</span></td>
                <td>{r.destination ?? "—"}</td>
                <td><BrandBadge brand={r.brand} /></td>
                <td>{r.operatorName ?? <span className="text-[color:var(--muted)]">—</span>}</td>
                <td className="num"><b>{clp(r.saleClp)}</b></td>
                <td className="num">{r.commissionPct != null ? pctTxt(r.commissionPct) : "—"}</td>
                <td className="num">{clp(r.grossClp)}</td>
                <td className="num">{clp(r.executiveClp)}</td>
                <td className="num">{clp(r.managementClp)}</td>
                <td className="num">{clp(r.agencyClp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.rows.length === 0 && <p className="crm-empty">No hay ventas cerradas con estos filtros.</p>}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {data && groupTable("Por operador", data.byOperator)}
        {data && groupTable("Por responsable", data.byOwner)}
      </div>
    </div>
  );
}
