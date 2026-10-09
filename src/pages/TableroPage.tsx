import { useNavigate } from "react-router-dom";
import { useCrm } from "@/contexts/CrmContext";
import { HBar, Kpi } from "@/components/crm/ui";
import { CHANNEL_LABEL, STATUS_LABEL, STATUS_ORDER, channelVar, clpShort, fechaLarga, pct, statusVar } from "@/lib/crm";
import type { QuoteChannel, QuoteStatus } from "@/lib/types";

// Tablero de control — pantalla 2 del CRM de Francisco, con datos reales.
export default function TableroPage() {
  const { stats } = useCrm();
  const navigate = useNavigate();
  const go = (qs: string) => navigate(`/solicitudes${qs ? `?${qs}` : ""}`);

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
        <button type="button" className="crm-btn primary" onClick={() => go("")}>
          Ver solicitudes →
        </button>
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
        <Kpi tone="riesgo" label="Urgentes (5+ días)" value={s.urgent} note="Sin contacto registrado" onClick={() => go("alert=urgente&sort=urgencia")} />
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
    </div>
  );
}
