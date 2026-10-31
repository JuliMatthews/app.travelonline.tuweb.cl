import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, MessageCircle, Mail, X } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import { useCrm } from "@/contexts/CrmContext";
import { AlertDot, BrandBadge, ChannelBadge, StatusBadge } from "@/components/crm/ui";
import {
  ALERT_LABEL,
  BRAND_LABEL,
  BRAND_ORDER,
  CHANNEL_LABEL,
  REQUEST_TYPE_LABEL,
  STATUS_HELP,
  STATUS_LABEL,
  STATUS_ORDER,
  clp,
  fecha,
  plazoCot,
  fechaHora,
  fechaLarga,
  haceDias,
  pax,
  statusVar,
} from "@/lib/crm";
import type { QuoteBrand, QuoteDetail, QuoteStatus } from "@/lib/types";

type QuoteUser = { id: string; name: string };
type OperatorOpt = { id: number; name: string };

// Detalle de una solicitud — cajón lateral del CRM de Francisco. Se usa en el
// cajón de /solicitudes y en la página completa /solicitudes/:id.
export function SolicitudDetail({
  id,
  onClose,
  onChanged,
}: {
  id: number;
  onClose?: () => void;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const { reload } = useCrm();
  const canEdit = can(user, "quotes:edit");
  const canMessage = can(user, "messages:send");
  const [q, setQ] = useState<QuoteDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [users, setUsers] = useState<QuoteUser[]>([]);
  const [note, setNote] = useState("");
  const [chat, setChat] = useState("");
  const [chatTo, setChatTo] = useState("");
  const [internal, setInternal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [closing, setClosing] = useState(false);
  const [sale, setSale] = useState("");
  const [operators, setOperators] = useState<OperatorOpt[]>([]);
  const [saleOperator, setSaleOperator] = useState("");

  const load = useCallback(() => {
    apiGet<{ quote: QuoteDetail }>(`/api-quotes.php?action=get&id=${id}`).then((res) => {
      if (res.ok) {
        setQ(res.quote);
        setInternal(res.quote.internalNotes ?? "");
        // Abrir la solicitud = leer los mensajes internos dirigidos a mí.
        if (res.quote.activity.some((a) => a.kind === "mensaje" && a.toUserId === user?.id && !a.readAt)) {
          apiPost(`/api-quotes.php?action=mark_read&id=${id}`, {}).then(() => reload());
        }
      } else setNotFound(true);
    });
  }, [id, user?.id, reload]);

  useEffect(() => {
    setQ(null);
    setMsg(null);
    setClosing(false);
    load();
    apiGet<{ users: QuoteUser[] }>("/api-quotes.php?action=users").then((res) => res.ok && setUsers(res.users));
    apiGet<{ operators: OperatorOpt[] }>("/api-operators.php").then((res) => res.ok && setOperators(res.operators));
  }, [load]);

  async function save(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    const res = await apiPost(`/api-quotes.php?action=update&id=${id}`, body);
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setMsg({ ok: true, text: okText });
    load();
    reload();
    onChanged?.();
  }

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    const res = await apiPost(`/api-quotes.php?action=note&id=${id}`, { body: note });
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setNote("");
    setMsg({ ok: true, text: "Seguimiento registrado. Se actualizó el último contacto." });
    load();
    reload();
    onChanged?.();
  }

  async function sendChat() {
    if (!chat.trim()) return;
    setBusy(true);
    const res = await apiPost(`/api-quotes.php?action=message&id=${id}`, { body: chat, toUserId: chatTo || null });
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setChat("");
    setMsg({ ok: true, text: "Mensaje interno enviado. El cliente no lo ve." });
    load();
  }

  function changeStatus(s: QuoteStatus) {
    if (!q || s === q.status) return;
    if (s === "venta_cerrada") {
      setClosing(true);
      setSale(String(q.totalClp ?? q.budgetClp ?? ""));
      setSaleOperator(q.operatorId ? String(q.operatorId) : "");
      return;
    }
    save({ status: s }, `Estado actualizado: ${STATUS_LABEL[s]}`);
  }

  if (notFound) return <p className="p-6 text-foreground/60">Solicitud no encontrada.</p>;
  if (!q) return <p className="p-6 text-foreground/50">Cargando…</p>;

  const incluir = Array.isArray(q.details.incluir) ? (q.details.incluir as string[]).join(", ") : null;
  const cuando = typeof q.details.cuando === "string" ? q.details.cuando : null;
  const edades = typeof q.details.edades === "string" ? q.details.edades : null;
  const phoneDigits = (q.passengerPhone || "").replace(/\D/g, "");
  const wsp = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(`Hola ${q.passengerName.split(" ")[0]}, te escribe Travel Online por tu solicitud ${q.folio ?? ""}.`)}`
    : null;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2>{q.passengerName}</h2>
          <p className="mt-0.5 text-[12.5px] text-[color:var(--muted)]">
            {q.folio ?? `#${q.id}`} · {REQUEST_TYPE_LABEL[q.requestType]} · {fechaLarga(q.createdAt)}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-[color:var(--muted)] hover:bg-surface-muted">
            <X size={19} />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={q.status} />
        <BrandBadge brand={q.brand} />
        <ChannelBadge channel={q.channel} />
        {q.travelType && <span className="crm-badge" style={{ "--c": "var(--muted)" } as React.CSSProperties}>{q.travelType}</span>}
        <span className="crm-badge inline-flex items-center gap-1.5" style={{ "--c": "var(--muted)" } as React.CSSProperties}>
          <AlertDot alert={q.alert} /> {q.alert === "cerrado" ? "Cerrada" : `último contacto ${haceDias(q.daysSinceContact)}`}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="crm-btn primary" to={`/solicitudes/${q.id}/cotizacion`}>
          <FileText size={15} /> Cotización y versiones
        </Link>
        {wsp && (
          <a className="crm-btn" href={wsp} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={15} /> WhatsApp
          </a>
        )}
        {q.passengerEmail && (
          <a className="crm-btn" href={`mailto:${q.passengerEmail}?subject=${encodeURIComponent(`Tu solicitud ${q.folio ?? ""} · Travel Online`)}`}>
            <Mail size={15} /> Correo
          </a>
        )}
        {onClose && (
          <Link className="crm-btn" to={`/solicitudes/${q.id}`} target="_blank">
            Abrir página completa
          </Link>
        )}
      </div>

      {q.quoteDue && (
        <p className="mt-3 rounded-lg px-3 py-2 text-[12.5px] font-bold" style={{ background: plazoCot(q.quoteDue)?.late ? "var(--rosa-050)" : "var(--mar-050)", color: plazoCot(q.quoteDue)?.late ? "var(--risk)" : "var(--st-en_seguimiento)" }}>
          ⏰ {plazoCot(q.quoteDue)?.text}
        </p>
      )}

      {msg && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold ${msg.ok ? "bg-[var(--mar-050)] text-[color:var(--ok)]" : "bg-[var(--rosa-050)] text-[color:var(--risk)]"}`} role="status">
          {msg.text}
        </p>
      )}

      <div className="crm-cols">
        <div className="crm-col">
      <div className="crm-section">Contacto</div>
      <dl className="crm-ficha">
        <dt>Correo</dt>
        <dd>{q.passengerEmail ? <a className="text-brand underline" href={`mailto:${q.passengerEmail}`}>{q.passengerEmail}</a> : "—"}</dd>
        <dt>WhatsApp / teléfono</dt>
        <dd>{q.passengerPhone || "—"}</dd>
        <dt>Ciudad</dt>
        <dd>{q.originCity ?? "—"}</dd>
        <dt>Llegó por</dt>
        <dd>{CHANNEL_LABEL[q.channel]}</dd>
        <dt>Marca</dt>
        <dd>
          {canEdit ? (
            <select
              className="crm-field"
              value={q.brand}
              disabled={busy}
              aria-label="Marca"
              onChange={(e) => save({ brand: e.target.value as QuoteBrand }, `Marca: ${BRAND_LABEL[e.target.value as QuoteBrand]}`)}
            >
              {BRAND_ORDER.map((b) => (
                <option key={b} value={b}>
                  {BRAND_LABEL[b]}
                </option>
              ))}
            </select>
          ) : (
            BRAND_LABEL[q.brand]
          )}
        </dd>
      </dl>

      <div className="crm-section">Información del viaje</div>
      <dl className="crm-ficha">
        {q.packageTitle && (
          <>
            <dt>Paquete</dt>
            <dd>{q.packageSlug ? <a className="text-brand underline" href={`/paquetes/${q.packageSlug}`} target="_blank" rel="noreferrer">{q.packageTitle}</a> : q.packageTitle}</dd>
          </>
        )}
        <dt>Destino(s)</dt>
        <dd>{q.destination ?? "—"}</dd>
        <dt>Fecha de viaje</dt>
        <dd>{q.preferredDateFrom ? `${fecha(q.preferredDateFrom)} → ${fecha(q.preferredDateTo)}` : cuando ?? "—"}</dd>
        <dt>Pasajeros</dt>
        <dd>
          {pax(q.adults, q.children)}
          {edades ? ` · edades ${edades}` : ""}
        </dd>
        {q.roomOptionLabel && (
          <>
            <dt>Habitación</dt>
            <dd>{q.roomOptionLabel}</dd>
          </>
        )}
        {incluir && (
          <>
            <dt>Quiere incluir</dt>
            <dd>{incluir}</dd>
          </>
        )}
        <dt>Presupuesto aprox.</dt>
        <dd>{q.budgetRange ? `${q.budgetRange} por persona` : clp(q.budgetClp)}</dd>
        {q.totalClp != null && (
          <>
            <dt>Total cotizado web</dt>
            <dd>
              {clp(q.totalClp)}
              {q.depositSuggestedClp != null && <span className="text-[color:var(--muted)]"> · abono sugerido {clp(q.depositSuggestedClp)}</span>}
            </dd>
          </>
        )}
        {q.selectedAddons.length > 0 && (
          <>
            <dt>Excursiones</dt>
            <dd>{q.selectedAddons.map((a) => `${a.name} (${clp(a.priceClp)})`).join(", ")}</dd>
          </>
        )}
        {q.comments && (
          <>
            <dt>Comentarios</dt>
            <dd className="italic">“{q.comments}”</dd>
          </>
        )}
      </dl>

      <div className="crm-section">Gestión comercial</div>
      <dl className="crm-ficha">
        <dt>Responsable</dt>
        <dd>
          <select
            className="crm-field w-full max-w-[260px]"
            disabled={!canEdit || busy}
            value={q.assignedTo ?? ""}
            onChange={(e) => save({ assignedTo: e.target.value || null }, "Responsable actualizado")}
          >
            <option value="">Sin asignar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </dd>
        <dt>Cotización enviada</dt>
        <dd>{fechaLarga(q.quotedAt)}</dd>
        <dt>Último contacto</dt>
        <dd>
          {fechaLarga(q.lastContactAt)} <span className="text-[color:var(--muted)]">· {ALERT_LABEL[q.alert]}</span>
        </dd>
        {q.status === "venta_cerrada" && (
          <>
            <dt>Monto vendido</dt>
            <dd className="font-bold text-[color:var(--ok)]">{clp(q.saleAmountClp)}</dd>
            <dt>Operador</dt>
            <dd>
              <select
                className="crm-field w-full max-w-[260px]"
                disabled={!canEdit || busy}
                value={q.operatorId ?? ""}
                onChange={(e) => save({ operatorId: e.target.value ? Number(e.target.value) : null }, "Operador actualizado")}
              >
                <option value="">Sin operador</option>
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </dd>
          </>
        )}
      </dl>

      <div className="crm-section">Observaciones internas</div>
      <textarea
        className="crm-field"
        placeholder="Notas visibles solo para el equipo."
        value={internal}
        disabled={!canEdit}
        onChange={(e) => setInternal(e.target.value)}
      />
      {canEdit && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="crm-btn"
            disabled={busy || internal === (q.internalNotes ?? "")}
            onClick={() => save({ internalNotes: internal }, "Observaciones guardadas")}
          >
            Guardar observaciones
          </button>
        </div>
      )}
        </div>
        <div className="crm-col">
      <div className="crm-section">Cambiar estado</div>
      <div className="flex flex-wrap gap-2">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            disabled={!canEdit || busy}
            title={STATUS_HELP[s]}
            onClick={() => changeStatus(s)}
            className="crm-btn"
            style={
              s === q.status
                ? { background: statusVar(s), borderColor: statusVar(s), color: "var(--surface)" }
                : { borderColor: `color-mix(in srgb, ${statusVar(s)} 45%, transparent)`, color: statusVar(s) }
            }
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {closing && (
        <div className="mt-3 rounded-xl border border-border bg-surface-muted p-3">
          <label className="block text-[12.5px] font-semibold" htmlFor="sale">
            Monto vendido (CLP)
          </label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <input
              id="sale"
              className="crm-field flex-1"
              inputMode="numeric"
              value={sale}
              onChange={(e) => setSale(e.target.value.replace(/\D/g, ""))}
              placeholder="Ej: 4500000"
            />
            <button
              type="button"
              className="crm-btn primary"
              disabled={busy || !sale}
              onClick={() => {
                setClosing(false);
                save({ status: "venta_cerrada", saleAmountClp: Number(sale), operatorId: saleOperator ? Number(saleOperator) : null }, "¡Venta cerrada!");
              }}
            >
              Confirmar venta
            </button>
            <button type="button" className="crm-btn" onClick={() => setClosing(false)}>
              Cancelar
            </button>
          </div>
          <label className="mt-3 block text-[12.5px] font-semibold" htmlFor="sale-op">
            Operador / proveedor de la venta (para la comisión)
          </label>
          <select id="sale-op" className="crm-field mt-1.5 w-full" value={saleOperator} onChange={(e) => setSaleOperator(e.target.value)}>
            <option value="">Sin operador (se puede asignar después)</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11.5px] text-[color:var(--muted)]">{sale ? clp(Number(sale)) : "Indica el monto total de la venta."}</p>
        </div>
      )}

      <div className="crm-section">Nota de seguimiento</div>
      <textarea
        className="crm-field"
        placeholder="Ej: Llamada de seguimiento, pide plazo hasta el viernes."
        value={note}
        disabled={!canEdit}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-[color:var(--muted)]">Al guardar se actualiza el último contacto.</span>
        <button type="button" className="crm-btn primary" disabled={!canEdit || busy || !note.trim()} onClick={addNote}>
          Registrar seguimiento
        </button>
      </div>

      {canMessage && (
        <>
          <div className="crm-section">Mensaje interno al equipo</div>
          <select className="crm-field mb-2" value={chatTo} onChange={(e) => setChatTo(e.target.value)} aria-label="Destinataria">
            <option value="">Para todo el equipo</option>
            {users
              .filter((u) => u.id !== user?.id)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  Para {u.name}
                </option>
              ))}
          </select>
          <textarea
            className="crm-field"
            placeholder="Ej: Carolina, el cliente pidió cambiar el hotel; revisa antes de enviar la nueva versión."
            value={chat}
            onChange={(e) => setChat(e.target.value)}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11.5px] text-[color:var(--muted)]">Solo lo ve el equipo. No cuenta como contacto con el cliente.</span>
            <button type="button" className="crm-btn primary" disabled={busy || !chat.trim()} onClick={sendChat}>
              Enviar mensaje
            </button>
          </div>
        </>
      )}

      <div className="crm-section">Historial de actividad</div>
      {q.activity.length === 0 ? (
        <p className="text-[13px] text-[color:var(--muted)]">Sin actividad registrada.</p>
      ) : (
        <div className="crm-timeline">
          {q.activity.map((a) => (
            <div key={a.id} className={`ev ${a.kind}`}>
              <div className="meta">
                {fechaHora(a.createdAt)} · {a.authorName ?? "Sistema"}
                {a.kind === "mensaje" && ` → ${a.toName ?? "todo el equipo"} · mensaje interno`}
              </div>
              <div className="txt">{a.body}</div>
              {a.versionId && (
                <a className="crm-pdf-btn" href={`/cotizacion/${a.versionId}/pdf`} target="_blank" rel="noreferrer">
                  <FileText size={12} /> Ver PDF
                </a>
              )}
            </div>
          ))}
        </div>
      )}

        </div>
      </div>
    </div>
  );
}
