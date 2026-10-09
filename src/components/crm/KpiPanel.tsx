import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCrm } from "@/contexts/CrmContext";
import { clp, clpShort, pct } from "@/lib/crm";

const KEY = "to_admin_kpi_panel";

// Panel lateral "Seguimiento de KPIs" (CRM de Francisco, pantalla 10).
// Comisiones y descuentos llegan en la fase 5 (operadores/descuentos).
export function KpiPanel() {
  const { stats } = useCrm();
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(() => localStorage.getItem(KEY) === "1");
  const toggle = () =>
    setHidden((h) => {
      localStorage.setItem(KEY, h ? "0" : "1");
      return !h;
    });

  if (hidden) {
    return (
      <aside className="crm-pk oculto" aria-label="Seguimiento de KPIs (plegado)">
        <button type="button" className="tog" onClick={toggle} title="Mostrar seguimiento de KPIs">
          ‹
        </button>
      </aside>
    );
  }

  const m = stats?.month;
  const avance = m && m.goal > 0 ? Math.min(100, (m.sold / m.goal) * 100) : 0;
  const proy = m && m.day > 0 ? Math.round((m.sold / m.day) * m.daysInMonth) : 0;
  const mesNombre = new Date().toLocaleDateString("es-CL", { month: "long", year: "numeric" });

  return (
    <aside className="crm-pk" aria-label="Seguimiento de KPIs">
      <button type="button" className="tog" onClick={toggle}>
        Seguimiento de KPIs ›
      </button>
      {!stats || !m ? (
        <p className="text-sm text-[color:var(--muted)]">Cargando…</p>
      ) : (
        <>
          <h3 style={{ marginTop: 0 }}>Meta del mes · {mesNombre}</h3>
          <div className="meta">
            <div className="cifra">{clp(m.sold)}</div>
            <div className="sub">
              de {clp(m.goal)} · {Math.round(avance)}% de avance
            </div>
            <div className="barra">
              <i style={{ width: `${avance}%` }} />
            </div>
            <div className="sub" style={{ marginTop: 8 }}>
              Día {m.day} de {m.daysInMonth} · proyección al cierre <b>{clp(proy)}</b>
            </div>
            {m.soldPrev > 0 && (
              <div className="sub" style={{ marginTop: 4, color: proy >= m.soldPrev ? "var(--ok)" : "var(--risk)", fontWeight: 700 }}>
                {proy >= m.soldPrev ? "▲" : "▼"} {Math.round((proy / m.soldPrev) * 100)}% vs. mes anterior (proyectado)
              </div>
            )}
          </div>

          <h3>Actividad del mes</h3>
          <div className="fila"><span className="et">Solicitudes recibidas</span><span className="va">{m.received}</span></div>
          <div className="fila"><span className="et">Cotizaciones enviadas</span><span className="va">{m.quoted}</span></div>
          <div className="fila"><span className="et">Ventas cerradas</span><span className="va">{m.sales}</span></div>
          <div className="fila"><span className="et">Ticket promedio histórico</span><span className="va">{clpShort(stats.avgTicket)}</span></div>

          <h3>Cartera activa</h3>
          <div className="fila"><span className="et">Solicitudes activas</span><span className="va">{stats.active}</span></div>
          <div className="fila"><span className="et">En seguimiento</span><span className="va">{stats.followUp}</span></div>
          <div className="fila"><span className="et">Ingreso potencial</span><span className="va">{clpShort(stats.potential)}</span></div>
          <div className="fila"><span className="et">Conversión acumulada</span><span className="va" style={{ color: "var(--ok)" }}>{pct(stats.conversion)}</span></div>
          <div className="fila">
            <span className="et">Tiempo de respuesta</span>
            <span className="va" style={{ color: (stats.avgResponseDays ?? 0) > 2 ? "var(--risk)" : "var(--ok)" }}>
              {stats.avgResponseDays != null ? `${stats.avgResponseDays.toLocaleString("es-CL")} d` : "—"}
            </span>
          </div>

          <h3>Alertas</h3>
          <button type="button" className="alerta" onClick={() => navigate("/solicitudes?alert=urgente")}>
            <b>{stats.urgent}</b>
            solicitudes con 5+ días sin contacto · ver →
          </button>
        </>
      )}
    </aside>
  );
}
