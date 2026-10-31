import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { apiGet } from "@/lib/api";
import { clp, clpShort, fecha } from "@/lib/crm";
import { BrandBadge, Kpi } from "@/components/crm/ui";
import type { LoyaltyData } from "@/lib/types";

const SEGMENTS = [
  { v: "", label: "Todos los clientes" },
  { v: "recurrentes", label: "★ Recurrentes (2+ compras)" },
  { v: "clientes", label: "Con al menos 1 compra" },
  { v: "sin_compra", label: "Sin compra todavía" },
];

// Fidelización: clientes recurrentes y referidos. Un cliente se identifica por correo (o teléfono).
export default function FidelizacionPage() {
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [segment, setSegment] = useState("");
  const [q, setQ] = useState("");
  const query = `segment=${segment}&q=${encodeURIComponent(q)}`;

  const load = useCallback(() => {
    apiGet<LoyaltyData>(`/api-loyalty.php?${query}`).then((res) => res.ok && setData(res));
  }, [query]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      <div className="crm-head">
        <div>
          <h1>Fidelización</h1>
          <p>Clientes recurrentes y referidos · {data ? `${data.customers.length} cliente${data.customers.length === 1 ? "" : "s"}` : "cargando…"}</p>
        </div>
        <a className="crm-btn" href={`/api-loyalty.php?action=export&${query}`}>
          <Download size={15} /> Exportar lista (CSV)
        </a>
      </div>

      {data && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Kpi label="Clientes registrados" value={data.summary.customers} note="Distintos por correo o teléfono" tone="mar" />
          <Kpi label="Con al menos una compra" value={data.summary.withPurchase} tone="ok" onClick={() => setSegment("clientes")} />
          <Kpi label="Recurrentes (2+ compras)" value={data.summary.recurring} note="Candidatos a descuento de fidelidad" tone="acento" onClick={() => setSegment("recurrentes")} />
        </div>
      )}

      <div className="crm-filters">
        <input type="search" className="crm-field crm-search" placeholder="Buscar por nombre, correo o teléfono" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar clientes" />
        <select className="crm-field" value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Segmento">
          {SEGMENTS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
      </div>

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr><th>Cliente</th><th>Marcas</th><th className="num">Solicitudes</th><th className="num">Compras</th><th className="num">Total comprado</th><th>Última actividad</th></tr>
          </thead>
          <tbody>
            {(data?.customers ?? []).map((c) => (
              <tr key={(c.email ?? "") + c.phone}>
                <td>
                  <b>{c.name}</b> {c.purchases >= 2 && <span title="Cliente recurrente">★</span>}
                  <span className="sub">{c.email ?? c.phone}</span>
                </td>
                <td><span className="flex flex-wrap gap-1">{c.brands.map((b) => <BrandBadge key={b} brand={b} />)}</span></td>
                <td className="num">{c.requests}</td>
                <td className="num">{c.purchases}</td>
                <td className="num"><b>{c.totalClp ? clp(c.totalClp) : "—"}</b></td>
                <td className="whitespace-nowrap">{fecha(c.lastAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.customers.length === 0 && <p className="crm-empty">No hay clientes en este segmento.</p>}
      </div>

      <div className="crm-panel mt-4">
        <div className="crm-section !mt-0 !border-0 !pt-0">Quienes más recomiendan</div>
        {data && data.referrers.length === 0 ? (
          <p className="text-[13px] text-[color:var(--muted)]">Aún no hay solicitudes con "Referido por". Se indica en la ficha de cada solicitud.</p>
        ) : (
          <table className="crm-table">
            <thead><tr><th>Cliente que recomienda</th><th className="num">Referidos</th><th className="num">Compras logradas</th><th className="num">Monto</th></tr></thead>
            <tbody>
              {data?.referrers.map((r) => (
                <tr key={r.email}><td><b>{r.name ?? r.email}</b><span className="sub">{r.email}</span></td><td className="num">{r.referred}</td><td className="num">{r.sales}</td><td className="num">{clpShort(r.totalClp)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
