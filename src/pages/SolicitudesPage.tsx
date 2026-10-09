import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download } from "lucide-react";
import { apiGet } from "@/lib/api";
import { AlertDot, ChannelBadge, StatusBadge } from "@/components/crm/ui";
import { SolicitudDetail } from "@/components/crm/SolicitudDetail";
import { CHANNEL_LABEL, CHANNEL_ORDER, STATUS_LABEL, STATUS_ORDER, clp, fecha } from "@/lib/crm";
import type { QuoteSummary } from "@/lib/types";

type QuoteUser = { id: string; name: string };
const FILTERS = ["q", "status", "channel", "assignedTo", "alert", "sort"] as const;

// Solicitudes — tabla maestra + cajón de detalle (pantalla 3 del CRM de Francisco).
export default function SolicitudesPage() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<QuoteSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [users, setUsers] = useState<QuoteUser[]>([]);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const openId = params.get("id") ? Number(params.get("id")) : null;

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page" && key !== "id") next.delete("page");
    setParams(next, { replace: key !== "id" });
  };

  const query = FILTERS.map((k) => `${k}=${encodeURIComponent(params.get(k) ?? "")}`).join("&");

  const load = useCallback(() => {
    apiGet<{ quotes: QuoteSummary[]; total: number; pages: number }>(
      `/api-quotes.php?action=list&perPage=25&page=${page}&${query}`
    ).then((res) => {
      if (res.ok) {
        setRows(res.quotes);
        setTotal(res.total);
        setPages(res.pages);
      }
    });
  }, [page, query]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  useEffect(() => {
    apiGet<{ users: QuoteUser[] }>("/api-quotes.php?action=users").then((res) => res.ok && setUsers(res.users));
  }, []);

  // Búsqueda con pequeña espera para no consultar por cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== search) set("q", search.trim());
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && set("id", "");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const hasFilters = FILTERS.some((k) => params.get(k));

  return (
    <div>
      <div className="crm-head">
        <div>
          <h1>Solicitudes</h1>
          <p>Registro maestro del proceso comercial · {rows ? `${total} registro${total === 1 ? "" : "s"}` : "cargando…"}</p>
        </div>
        <a className="crm-btn" href={`/api-quotes.php?action=export&${query}`}>
          <Download size={15} /> Exportar a Excel (CSV)
        </a>
      </div>

      <div className="crm-filters">
        <input
          type="search"
          className="crm-field crm-search"
          placeholder="Buscar por nombre, correo, destino, teléfono o folio"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar solicitudes"
        />
        <select className="crm-field" value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select className="crm-field" value={params.get("channel") ?? ""} onChange={(e) => set("channel", e.target.value)} aria-label="Canal">
          <option value="">Todos los canales</option>
          {CHANNEL_ORDER.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABEL[c]}
            </option>
          ))}
        </select>
        <select className="crm-field" value={params.get("assignedTo") ?? ""} onChange={(e) => set("assignedTo", e.target.value)} aria-label="Responsable">
          <option value="">Todo el equipo</option>
          <option value="me">Asignadas a mí</option>
          <option value="unassigned">Sin asignar</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select className="crm-field" value={params.get("alert") ?? ""} onChange={(e) => set("alert", e.target.value)} aria-label="Seguimiento">
          <option value="">Toda la cartera</option>
          <option value="activas">Solo activas</option>
          <option value="urgente">🔴 Urgentes (5+ días)</option>
          <option value="atencion">🟡 Atención (3-4 días)</option>
          <option value="aldia">🟢 Al día</option>
        </select>
        <select className="crm-field" value={params.get("sort") ?? ""} onChange={(e) => set("sort", e.target.value)} aria-label="Orden">
          <option value="">Más recientes primero</option>
          <option value="antiguas">Más antiguas primero</option>
          <option value="urgencia">Más urgentes primero</option>
          <option value="monto">Mayor monto primero</option>
        </select>
        {hasFilters && (
          <button
            type="button"
            className="crm-btn"
            onClick={() => {
              setSearch("");
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Celular: tarjetas */}
      <div className="crm-cards md:hidden">
        {(rows ?? []).map((r) => (
          <button key={r.id} type="button" className="crm-card" onClick={() => set("id", String(r.id))}>
            <div className="l1">
              <b className="truncate">{r.passengerName}</b>
              <AlertDot alert={r.alert} days={r.daysSinceContact} />
            </div>
            <div className="l2">
              {r.folio ?? `#${r.id}`} · {fecha(r.createdAt)} · {r.destination ?? "—"} · {r.adults + r.children} pax
            </div>
            <div className="l3">
              <StatusBadge status={r.status} />
              <ChannelBadge channel={r.channel} />
              <span className="ml-auto text-[13px] font-bold">
                {r.saleAmountClp != null ? clp(r.saleAmountClp) : clp(r.totalClp ?? r.budgetClp)}
              </span>
            </div>
          </button>
        ))}
        {rows && rows.length === 0 && <p className="crm-empty">No hay solicitudes con estos filtros.</p>}
      </div>

      <div className="crm-table-wrap hidden md:block">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Fecha</th>
              <th>Pasajero</th>
              <th>Destino</th>
              <th className="num">Pax</th>
              <th>Canal</th>
              <th>Estado</th>
              <th>Resp.</th>
              <th className="num">Monto</th>
              <th title="Seguimiento: días sin contacto">Seg.</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr
                key={r.id}
                className="clic"
                tabIndex={0}
                onClick={() => set("id", String(r.id))}
                onKeyDown={(e) => e.key === "Enter" && set("id", String(r.id))}
              >
                <td className="whitespace-nowrap text-[12px] text-[color:var(--muted)]">{r.folio ?? `#${r.id}`}</td>
                <td className="whitespace-nowrap">{fecha(r.createdAt)}</td>
                <td>
                  <span className="whitespace-nowrap font-bold">{r.passengerName}</span>
                  <span className="sub">{r.originCity ?? r.passengerEmail ?? ""}</span>
                </td>
                <td className="min-w-[140px]">{r.destination ?? "—"}</td>
                <td className="num">{r.adults + r.children}</td>
                <td>
                  <ChannelBadge channel={r.channel} />
                </td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td className="whitespace-nowrap">{r.assignedToName ?? <span className="text-[color:var(--muted)]">—</span>}</td>
                <td className="num">
                  {r.saleAmountClp != null ? (
                    <b className="text-[color:var(--ok)]">{clp(r.saleAmountClp)}</b>
                  ) : (
                    clp(r.totalClp ?? r.budgetClp)
                  )}
                </td>
                <td className="text-center">
                  <AlertDot alert={r.alert} days={r.daysSinceContact} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && rows.length === 0 && <p className="crm-empty">No hay solicitudes con estos filtros.</p>}
        {!rows && <p className="crm-empty">Cargando…</p>}
      </div>

      <div className="crm-pager">
        <span>
          Página {page} de {pages} · 25 por página
        </span>
        <span className="flex gap-2">
          <button type="button" className="crm-btn" disabled={page <= 1} onClick={() => set("page", String(page - 1))}>
            ← Anterior
          </button>
          <button type="button" className="crm-btn" disabled={page >= pages} onClick={() => set("page", String(page + 1))}>
            Siguiente →
          </button>
        </span>
      </div>

      {openId && (
        <div className="crm-overlay" onClick={() => set("id", "")}>
          <div className="crm-drawer" role="dialog" aria-modal="true" aria-label="Detalle de la solicitud" onClick={(e) => e.stopPropagation()}>
            <SolicitudDetail id={openId} onClose={() => set("id", "")} onChanged={load} />
          </div>
        </div>
      )}
    </div>
  );
}
