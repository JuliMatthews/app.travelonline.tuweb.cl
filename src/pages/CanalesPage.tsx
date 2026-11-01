import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { useCrm } from "@/contexts/CrmContext";
import { CHANNEL_LABEL, channelVar, fechaHora, haceDias } from "@/lib/crm";
import type { ChannelHealth } from "@/lib/types";

// Salud de los canales de entrada: si un canal deja de recibir solicitudes, se nota aquí.
// Mide lo que ya llegó al CRM; la lectura automática de la casilla Info llega con el hosting nuevo.
export default function CanalesPage() {
  const { reload } = useCrm();
  const [channels, setChannels] = useState<ChannelHealth[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [days, setDays] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = useCallback((list: ChannelHealth[]) => {
    setChannels(list);
    setDays(Object.fromEntries(list.map((c) => [c.channel, String(c.alertDays)])));
  }, []);

  useEffect(() => {
    apiGet<{ channels: ChannelHealth[]; canEdit: boolean }>("/api-channels.php").then((res) => {
      if (res.ok) {
        apply(res.channels);
        setCanEdit(res.canEdit);
      }
    });
  }, [apply]);

  async function save() {
    const res = await apiPost<{ channels: ChannelHealth[] }>("/api-channels.php?action=save", {
      alertDays: Object.fromEntries(Object.entries(days).map(([k, v]) => [k, Number(v) || 0])),
    });
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    apply(res.channels);
    reload();
    setMsg({ ok: true, text: "Límites guardados." });
  }

  const silentCount = channels?.filter((c) => c.silent).length ?? 0;

  return (
    <div>
      <div className="crm-head">
        <div>
          <h1>Canales de entrada</h1>
          <p>Por dónde llegan las solicitudes y si algún canal dejó de entrar.</p>
        </div>
      </div>

      {channels && silentCount > 0 && (
        <p className="mb-4 rounded-lg bg-[var(--rosa-050)] px-3 py-2 text-[12.5px] font-semibold text-[color:var(--risk)]" role="alert">
          ⚠ {silentCount} canal{silentCount === 1 ? "" : "es"} sin solicitudes por más días del límite. Revisa si el canal sigue funcionando (por ejemplo, que alguien esté mirando la casilla).
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(channels ?? []).map((c) => {
          const max = Math.max(1, ...c.series);
          const trend = c.last7 - c.prev7;
          return (
            <div key={c.channel} className="crm-panel" style={{ borderLeft: `4px solid ${c.silent ? "var(--risk)" : channelVar(c.channel)}` }}>
              <div className="flex items-start justify-between gap-2">
                <h2 style={{ fontSize: 16 }}>{CHANNEL_LABEL[c.channel]}</h2>
                <span
                  className="crm-badge"
                  style={{ "--c": c.silent ? "var(--risk)" : c.alertDays === 0 ? "var(--muted)" : "var(--st-venta_cerrada)" } as React.CSSProperties}
                >
                  {c.silent ? "En silencio" : c.alertDays === 0 ? "Sin alerta" : "Al día"}
                </span>
              </div>
              <p className="mt-2 text-[13px]">
                {c.lastAt ? (
                  <>
                    Última solicitud: <b>{fechaHora(c.lastAt)}</b>
                    <span className="text-[color:var(--muted)]"> · {haceDias(c.silentDays ?? 0)}</span>
                  </>
                ) : (
                  <span className="text-[color:var(--muted)]">Aún no ha llegado ninguna.</span>
                )}
              </p>
              <div className="mt-3 flex items-end gap-1" style={{ height: 44 }} aria-label="Solicitudes por semana, últimas 8 semanas">
                {c.series.map((n, i) => (
                  <i
                    key={i}
                    title={`${n} solicitud${n === 1 ? "" : "es"} · hace ${7 - i} semana${7 - i === 1 ? "" : "s"}`.replace("hace 0 semanas", "esta semana")}
                    style={{ flex: 1, height: `${n ? Math.max(12, (n / max) * 100) : 4}%`, background: n ? channelVar(c.channel) : "var(--border)", borderRadius: 3, opacity: i === 7 ? 1 : 0.7 }}
                  />
                ))}
              </div>
              <p className="mt-1 text-[11px] text-[color:var(--muted)]">Últimas 8 semanas</p>
              <dl className="crm-ficha" style={{ gridTemplateColumns: "1fr auto" }}>
                <dt>Últimos 7 días</dt>
                <dd>{c.last7} <span className="text-[11.5px] text-[color:var(--muted)]">({trend >= 0 ? "+" : ""}{trend} vs. semana anterior)</span></dd>
                <dt>Últimos 30 días</dt>
                <dd>{c.last30}</dd>
                <dt>Total histórico</dt>
                <dd>{c.total}</dd>
              </dl>
              {canEdit && (
                <label className="mt-2 flex items-center gap-2 text-[12px] font-semibold">
                  Avisar tras
                  <input
                    className="crm-field"
                    style={{ width: 70 }}
                    inputMode="numeric"
                    value={days[c.channel] ?? ""}
                    onChange={(e) => setDays({ ...days, [c.channel]: e.target.value.replace(/\D/g, "") })}
                  />
                  días sin solicitudes <span className="font-normal text-[color:var(--muted)]">(0 = sin alerta)</span>
                </label>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && channels && (
        <div className="mt-4 flex items-center justify-end gap-3">
          {msg && <span className={`text-[13px] ${msg.ok ? "text-[color:var(--ok)]" : "text-[color:var(--risk)]"}`}>{msg.text}</span>}
          <button type="button" className="crm-btn primary" onClick={save}>Guardar límites</button>
        </div>
      )}
    </div>
  );
}
