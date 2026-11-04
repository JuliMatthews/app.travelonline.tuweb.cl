import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import { useCrm } from "@/contexts/CrmContext";
import { HBar, Kpi } from "@/components/crm/ui";
import { CHANNEL_LABEL, STATUS_LABEL, STATUS_ORDER, channelVar, clpShort, fechaLarga, horasTxt, pct, statusVar } from "@/lib/crm";
import type { QuoteChannel, QuoteStatus } from "@/lib/types";

// Tablero de control — pantalla 2 del CRM de Francisco, con datos reales.
export default function TableroPage() {
  const { stats, alertCfg } = useCrm();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [usd, setUsd] = useState<{ value: number | null; date: string | null; rate: number | null } | null>(null);
  useEffect(() => {
    apiGet<{ observed: { value: number | null; date: string | null }; rate: number | null }>("/api-pricing.php?action=observed").then((r) => {
      if (r.ok) setUsd({ value: r.observed.value, date: r.observed.date, rate: r.rate });
    });
  }, []);
  type FxItem = { code: string; name: string; clp: number; date: string | null; official: boolean };
  type FxGroup = { label: string; items: FxItem[] };
  const [fx, setFx] = useState<Record<string, { clp: number; date: string | null }>>({});
  const [fxGroups, setFxGroups] = useState<FxGroup[]>([]);
  const [fxUpdated, setFxUpdated] = useState<string | null>(null);
  const [fxOpen, setFxOpen] = useState(false);
  useEffect(() => {
    apiGet<{ groups: FxGroup[]; updatedAt: string | null }>("/api-pricing.php?action=currencies").then((r) => {
      if (!r.ok) return;
      const m: Record<string, { clp: number; date: string | null }> = {};
      r.groups.forEach((g) => g.items.forEach((c) => { m[c.code] = { clp: c.clp, date: c.date }; }));
      setFx(m);
      setFxGroups(r.groups);
      setFxUpdated(r.updatedAt);
    });
  }, []);
  useEffect(() => {
    if (!fxOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFxOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fxOpen]);
  const go = (qs: string) => navigate(`/solicitudes${qs ? `?${qs}` : ""}`);

  if (!can(user, "quotes:view")) return <Navigate to={can(user, "reports:view") ? "/reportes" : "/solicitudes"} replace />;
  if (!stats) return <p className="text-foreground/50">Cargando tablero…</p>;

  const s = stats;
  const funnel = [
    { label: "Solicitudes recibidas", n: s.total },
    { label: "Cotizaciones enviadas", n: s.quoted },
    { label: "Con respuesta del pasajero", n: s.responded },
    { label: "Ventas cerradas", n: s.sales },
  ];
  const byStatus = STATUS_ORDER.map((k) => ({ k, n: s.byStatus.find((x) => x.key === k)?.count ?? 0 }));
  const maxStatus = Math.max(1, ...byStatus.map((x) => x.n));
  const maxCh = Math.max(1, ...s.byChannel.map((x) => x.count));
  const maxOwner = Math.max(1, ...s.byOwner.map((x) => x.count));
  const maxType = Math.max(1, ...s.byTravelType.map((x) => x.count));

  return (
    <div>
      <div className="crm-head">
        <div>
          <h1>Tablero de control</h1>
          <p>Travel Online · datos al {fechaLarga(new Date().toISOString())}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {fxGroups.length > 0 && (
            <button type="button" className="crm-btn" onClick={() => setFxOpen(true)} title="Ver todas las monedas de hoy">
              ver +monedas
            </button>
          )}
          {usd?.value && (
            <div className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-right leading-tight" title="Dólar observado del Banco Central de Chile. Con él se calculan los precios en pesos de los programas en USD.">
              <span className="block text-[11px] uppercase tracking-wide text-[color:var(--muted)]">Dólar hoy</span>
              <span className="text-lg font-bold">${usd.value.toLocaleString("es-CL")}</span>
              <span className="block text-[11px] text-[color:var(--muted)]">
                {usd.date ? new Date(`${usd.date}T12:00:00`).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : ""}
                {usd.rate && usd.rate !== usd.value ? ` · se usa $${usd.rate.toLocaleString("es-CL")}` : ""}
              </span>
            </div>
          )}
          {([["EUR", "Euro hoy", "Euro · oficial del Banco Central de Chile"], ["JPY", "Yen hoy", "Yen japonés (JPY) · referencial"], ["CNY", "Yuan hoy", "Yuan chino (CNY) · referencial"]] as const).map(([code, label, tip]) =>
            fx[code] ? (
              <div key={code} className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-right leading-tight" title={`${tip}. Pesos chilenos por 1 unidad.`}>
                <span className="block text-[11px] uppercase tracking-wide text-[color:var(--muted)]">{label}</span>
                <span className="text-lg font-bold">${fx[code].clp.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="block text-[11px] text-[color:var(--muted)]">{fx[code].date ? new Date(`${fx[code].date}T12:00:00`).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : ""}</span>
              </div>
            ) : null,
          )}
          <button type="button" className="crm-btn primary" onClick={() => go("")}>
            Ver solicitudes →
          </button>
        </div>
      </div>

      <div className="crm-kpis">
        <Kpi tone="acento" label="Total solicitudes" value={s.total} note="Histórico acumulado" onClick={() => go("")} />
        <Kpi
          label="Cotizaciones enviadas"
          value={s.quoted}
          note={s.total ? `${Math.round((s.quoted / s.total) * 100)}% de las solicitudes` : "—"}
          onClick={() => go("status=cotizacion_enviada")}
        />
        <Kpi tone="ok" label="Ventas cerradas" value={s.sales} note={`Ticket promedio ${clpShort(s.avgTicket)}`} onClick={() => go("status=venta_cerrada")} />
        <Kpi tone="ok" label="Tasa de conversión" value={pct(s.conversion)} note={`Meta 25% · ${pct(s.conversionQuoted)} sobre cotizadas`} />
        <Kpi label="En seguimiento" value={s.followUp} note={`${s.active} solicitudes activas en total`} onClick={() => go("status=en_seguimiento")} />
        <Kpi tone="riesgo" label={`Urgentes (${horasTxt(alertCfg.urgentHours)}+)`} value={s.urgent} note="Sin contacto registrado" onClick={() => go("alert=urgente&sort=urgencia")} />
        <Kpi tone="mar" label="Ingreso por ventas" value={clpShort(s.revenue)} note="Ventas cerradas" />
        <Kpi label="Ingreso potencial" value={clpShort(s.potential)} note="Cotizaciones aún abiertas" onClick={() => go("alert=activas")} />
      </div>

      <div className="crm-grid-2">
        <section className="crm-panel">
          <h2>Embudo de conversión</h2>
          <p className="desc">Recorrido de las solicitudes por el proceso de venta.</p>
          {funnel.map((f) => {
            const w = s.total ? Math.round((f.n / s.total) * 100) : 0;
            return (
              <div className="crm-funnel" key={f.label}>
                <div className="top">
                  <span>{f.label}</span>
                  <b>
                    {f.n} · {w}%
                  </b>
                </div>
                <div className="pista">
                  <i style={{ width: `${Math.max(w, 2)}%` }} />
                </div>
              </div>
            );
          })}
          <p className="crm-note">
            Tiempo promedio de respuesta:{" "}
            <b>{s.avgResponseDays != null ? `${s.avgResponseDays.toLocaleString("es-CL")} días` : "—"}</b> desde que llega la
            solicitud hasta que se envía la cotización. Meta: 2 días.
          </p>
        </section>

        <section className="crm-panel">
          <h2>Solicitudes por estado</h2>
          <p className="desc">Estados del plan de trabajo de Travel Online.</p>
          {byStatus.map(({ k, n }) => (
            <button key={k} type="button" className="block w-full text-left" onClick={() => go(`status=${k}`)}>
              <HBar label={STATUS_LABEL[k as QuoteStatus]} value={n} max={maxStatus} color={statusVar(k)} />
            </button>
          ))}
          <button type="button" className="crm-btn mt-4" onClick={() => go("")}>
            Ver todas las solicitudes →
          </button>
        </section>
      </div>

      <div className="crm-grid-3">
        <section className="crm-panel">
          <h2>Por canal de entrada</h2>
          <p className="desc">De dónde llegan los pasajeros.</p>
          {s.byChannel.map((c) => (
            <button key={c.key} type="button" className="block w-full text-left" onClick={() => go(`channel=${c.key}`)}>
              <HBar label={CHANNEL_LABEL[c.key as QuoteChannel] ?? c.key} value={c.count} max={maxCh} color={channelVar(c.key)} />
            </button>
          ))}
        </section>
        <section className="crm-panel">
          <h2>Por responsable</h2>
          <p className="desc">Carga de trabajo del equipo.</p>
          {s.byOwner.map((o) => (
            <HBar key={o.key} label={o.key} value={o.count} max={maxOwner} color="var(--brand)" />
          ))}
        </section>
        <section className="crm-panel">
          <h2>Por tipo de viaje</h2>
          <p className="desc">Qué se está pidiendo más.</p>
          {s.byTravelType.map((t) => (
            <HBar key={t.key} label={t.key} value={t.count} max={maxType} color="var(--salvia)" />
          ))}
        </section>
      </div>

      <section className="crm-panel">
        <h2>Destinos más solicitados</h2>
        <p className="desc">Top 8 por cantidad de solicitudes.</p>
        <div className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Destino</th>
                <th className="num">Solicitudes</th>
                <th className="num">Ventas</th>
                <th className="num">Conversión</th>
              </tr>
            </thead>
            <tbody>
              {s.topDestinations.map((d, i) => (
                <tr key={d.destination} className="clic" onClick={() => go(`q=${encodeURIComponent(d.destination)}`)}>
                  <td className="text-foreground/50">{i + 1}</td>
                  <td className="font-semibold">{d.destination}</td>
                  <td className="num">{d.count}</td>
                  <td className="num">{d.sales}</td>
                  <td className="num">{pct(d.count ? (d.sales / d.count) * 100 : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {fxOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Monedas de hoy" onClick={() => setFxOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Monedas de hoy</h2>
                <p className="text-[12.5px] text-[color:var(--muted)]">Pesos chilenos por 1 unidad, según los destinos de nuestros programas.{fxUpdated && <> Última actualización: {new Date(fxUpdated.replace(" ", "T")).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}.{Date.now() - new Date(fxUpdated.replace(" ", "T")).getTime() > 36 * 3600 * 1000 && <b className="text-[color:var(--risk)]"> Los datos están desactualizados: la fuente no responde.</b>}</>}</p>
              </div>
              <button type="button" className="crm-btn" onClick={() => setFxOpen(false)} aria-label="Cerrar">Cerrar ✕</button>
            </div>
            <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {fxGroups.map((g) => (
                <div key={g.label}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">{g.label}</p>
                  <ul className="mt-1.5 space-y-1">
                    {g.items.map((c) => (
                      <li key={c.code} className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] pb-1 text-[13px]">
                        <span><b>{c.code}</b> <span className="text-[color:var(--muted)]">{c.name}</span>{c.official && <span className="ml-1 text-[color:var(--ok)]" title="Oficial del Banco Central de Chile">●</span>}</span>
                        <b>${c.clp.toLocaleString("es-CL", { minimumFractionDigits: c.clp < 100 || c.official ? 2 : 0, maximumFractionDigits: c.clp < 100 || c.official ? 2 : 0 })}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11.5px] text-[color:var(--muted)]">
              ● Dólar y euro: oficiales del Banco Central de Chile. Las demás son referenciales (<a className="underline" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">ExchangeRate-API</a>), calculadas contra el dólar observado, y se actualizan solas cada pocas horas. Los precios de los programas se calculan solo con el dólar.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
