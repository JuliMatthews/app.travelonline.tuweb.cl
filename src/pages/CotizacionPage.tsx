import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import { useCrm } from "@/contexts/CrmContext";
import { clp, fecha, fechaHora, plazoCot } from "@/lib/crm";
import type { ItineraryDay, Quotation, QuotationLine, QuotationVersion } from "@/lib/types";

const emptyLine = (): QuotationLine => ({ title: "", detail: "", amountClp: 0 });
const emptyDay = (n: number): ItineraryDay => ({ title: `Día ${n}`, detail: "" });

// Editor de la cotización de una solicitud: versiones a la izquierda, formulario a la derecha.
// Borrador = editable. Enviada = congelada; para cambiar algo se crea una versión nueva.
export default function CotizacionPage() {
  const { id } = useParams<{ id: string }>();
  const requestId = Number(id);
  const { user } = useAuth();
  const { reload } = useCrm();
  const canEdit = can(user, "quotes:edit");
  const canPackage = can(user, "packages:edit");
  const navigate = useNavigate();
  const [quotation, setQuotation] = useState<Quotation | null | undefined>(undefined);
  const [selected, setSelected] = useState<number | null>(null);
  const [form, setForm] = useState<QuotationVersion | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = useCallback((q: Quotation | null, keep?: number | null) => {
    setQuotation(q);
    if (!q) return;
    const pick = q.versions.find((v) => v.id === keep) ?? q.versions[0];
    setSelected(pick.id);
    setForm(structuredClone(pick));
  }, []);

  useEffect(() => {
    apiGet<{ quotation: Quotation | null }>(`/api-quotations.php?action=get&requestId=${requestId}`).then((res) =>
      res.ok ? apply(res.quotation) : setQuotation(null)
    );
  }, [requestId, apply]);

  async function call(path: string, body: unknown, okText: string, keep?: number | null) {
    setBusy(true);
    setMsg(null);
    const res = await apiPost<{ quotation: Quotation }>(path, body);
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    apply(res.quotation, keep);
    setMsg({ ok: true, text: okText });
    reload();
    return res.quotation;
  }

  if (quotation === undefined) return <p className="text-foreground/50">Cargando…</p>;

  if (quotation === null) {
    return (
      <div className="mx-auto max-w-xl">
        <Link to={`/solicitudes?id=${requestId}`} className="mb-4 inline-block text-[13px] font-semibold text-[color:var(--muted)]">← Volver a la solicitud</Link>
        <div className="crm-panel">
          <h2>Esta solicitud aún no tiene cotización</h2>
          <p className="mt-2 text-[13px] text-[color:var(--muted)]">Se crea la cotización N° nuevo con una primera versión en borrador, que puedes editar.</p>
          {canEdit && (
            <button type="button" className="crm-btn primary mt-4" disabled={busy} onClick={() => call(`/api-quotations.php?action=create&requestId=${requestId}`, {}, "Cotización creada")}>
              Crear cotización
            </button>
          )}
          {msg && !msg.ok && <p className="mt-3 text-[13px] text-[color:var(--risk)]">{msg.text}</p>}
        </div>
      </div>
    );
  }

  if (!form) return null;
  const editable = canEdit && form.status === "borrador";
  const subtotal = form.lines.reduce((a, l) => a + (Number(l.amountClp) || 0), 0);
  const total = Math.max(0, subtotal - (Number(form.discountClp) || 0));
  const latest = quotation.versions[0];
  const set = <K extends keyof QuotationVersion>(k: K, v: QuotationVersion[K]) => setForm({ ...form, [k]: v });
  const setLine = (i: number, patch: Partial<QuotationLine>) =>
    set("lines", form.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const setDay = (i: number, patch: Partial<ItineraryDay>) =>
    set("itinerary", form.itinerary.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const moveDay = (i: number, to: number) => {
    const next = [...form.itinerary];
    [next[i], next[to]] = [next[to], next[i]];
    set("itinerary", next);
  };
  const body = { ...form, discountClp: Number(form.discountClp) || 0 };

  return (
    <div>
      <Link to={`/solicitudes?id=${requestId}`} className="mb-3 inline-block text-[13px] font-semibold text-[color:var(--muted)] hover:text-foreground">
        ← Volver a la solicitud
      </Link>
      <div className="crm-head">
        <div>
          <h1>Cotización N° {quotation.number}</h1>
          <p>Versión {form.label} · {form.status === "borrador" ? "borrador (editable)" : `enviada ${fechaHora(form.sentAt)} · congelada`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPackage && canEdit && (
            quotation.packageId ? (
              <Link className="crm-btn" to={`/paquetes/${quotation.packageId}/editar`}>
                Ver el paquete ({quotation.packageStatus === "published" ? "publicado" : quotation.packageStatus === "archived" ? "archivado" : "borrador"})
              </Link>
            ) : (
              <button
                type="button"
                className="crm-btn"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm("Se creará un paquete en BORRADOR con el título, lo que incluye / no incluye y el itinerario de esta versión. No se publica en el sitio hasta que lo cambies a Publicado. ¿Continuar?")) return;
                  setBusy(true);
                  const res = await apiPost<{ packageId: string; quotation: Quotation }>(`/api-quotations.php?action=to_package&versionId=${form.id}`, {});
                  setBusy(false);
                  if (!res.ok) return setMsg({ ok: false, text: res.error });
                  navigate(`/paquetes/${res.packageId}/editar`);
                }}
              >
                Guardar como paquete
              </button>
            )
          )}
          <a className="crm-btn" href={`/cotizacion/${form.id}/pdf`} target="_blank" rel="noreferrer">
            Ver / guardar PDF
          </a>
        </div>
      </div>

      {msg && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold ${msg.ok ? "bg-[var(--mar-050)] text-[color:var(--ok)]" : "bg-[var(--rosa-050)] text-[color:var(--risk)]"}`} role="status">
          {msg.text}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[250px_1fr]">
        <aside className="crm-panel h-fit">
          <div className="crm-section !mt-0">Versiones</div>
          <ul className="flex flex-col gap-1.5">
            {quotation.versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(v.id);
                    setForm(structuredClone(v));
                    setMsg(null);
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-[13px] ${selected === v.id ? "border-[var(--mar)] bg-[var(--mar-050)]" : "border-[var(--border)]"}`}
                >
                  <b>{v.label}</b> · {v.status === "borrador" ? "borrador" : "enviada"}
                  <span className="block text-[11.5px] text-[color:var(--muted)]">
                    {clp(v.totalClp)} · {fecha(v.createdAt)}
                    {v.changeReason ? ` · ${v.changeReason}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {canEdit && latest.status === "enviada" && (
            <div className="mt-3">
              <input className="crm-field block w-full" placeholder="Motivo del cambio (ej: pide otro hotel)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button
                type="button"
                className="crm-btn primary mt-2 w-full"
                disabled={busy}
                onClick={async () => {
                  const q = await call(`/api-quotations.php?action=new_version&requestId=${requestId}`, { changeReason: reason }, "Nueva versión creada en borrador");
                  if (q) setReason("");
                }}
              >
                Crear versión nueva
              </button>
            </div>
          )}
        </aside>

        <section className="crm-panel">
          <label className="block text-[12.5px] font-semibold">Título</label>
          <input className="crm-field block w-full" disabled={!editable} value={form.title} onChange={(e) => set("title", e.target.value)} />
          <label className="mt-3 block text-[12.5px] font-semibold">Subtítulo (noches, fechas…)</label>
          <input className="crm-field block w-full" disabled={!editable} value={form.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} />
          {form.status === "borrador" && form.promisedAt && (
            <p className="mt-3 rounded-lg px-3 py-2 text-[12.5px] font-bold" style={{ background: plazoCot(form.promisedAt)?.late ? "var(--rosa-050)" : "var(--mar-050)", color: plazoCot(form.promisedAt)?.late ? "var(--risk)" : "var(--st-en_seguimiento)" }}>
              ⏰ {plazoCot(form.promisedAt)?.text}
            </p>
          )}
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[12.5px] font-semibold">Pasajeros</label>
              <input className="crm-field block w-full" type="number" min={1} disabled={!editable} value={form.pax} onChange={(e) => set("pax", Number(e.target.value) || 1)} />
            </div>
            <div>
              <label className="block text-[12.5px] font-semibold">Válida hasta</label>
              <input className="crm-field block w-full" type="date" disabled={!editable} value={form.validUntil ?? ""} onChange={(e) => set("validUntil", e.target.value)} />
            </div>
            <div>
              <label className="block text-[12.5px] font-semibold">Comprometida para</label>
              <input className="crm-field block w-full" type="date" disabled={!editable} value={form.promisedAt ?? ""} onChange={(e) => set("promisedAt", e.target.value || null)} />
            </div>
          </div>

          <div className="crm-section">Detalle y valores</div>
          {form.lines.map((l, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_130px_auto] items-start gap-2">
              <div>
                <input className="crm-field block w-full" placeholder="Servicio (vuelos, hotel…)" disabled={!editable} value={l.title} onChange={(e) => setLine(i, { title: e.target.value })} />
                <input className="crm-field mt-1 block w-full" placeholder="Detalle" disabled={!editable} value={l.detail} onChange={(e) => setLine(i, { detail: e.target.value })} />
              </div>
              <input className="crm-field block w-full" inputMode="numeric" placeholder="Monto CLP" disabled={!editable} value={l.amountClp || ""} onChange={(e) => setLine(i, { amountClp: Number(e.target.value.replace(/\D/g, "")) })} />
              {editable && (
                <button type="button" className="crm-btn" aria-label="Quitar línea" onClick={() => set("lines", form.lines.filter((_, j) => j !== i))}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {editable && (
            <button type="button" className="crm-btn" onClick={() => set("lines", [...form.lines, emptyLine()])}>
              <Plus size={14} /> Agregar línea
            </button>
          )}

          <div className="mt-3 grid grid-cols-[1fr_130px] gap-2">
            <input className="crm-field block w-full" placeholder="Descuento (motivo)" disabled={!editable} value={form.discountLabel ?? ""} onChange={(e) => set("discountLabel", e.target.value)} />
            <input className="crm-field block w-full" inputMode="numeric" placeholder="Descuento CLP" disabled={!editable} value={form.discountClp || ""} onChange={(e) => set("discountClp", Number(e.target.value.replace(/\D/g, "")))} />
          </div>
          <p className="mt-3 text-right text-[13px] text-[color:var(--muted)]">Subtotal {clp(subtotal)}</p>
          <p className="text-right text-[18px] font-extrabold">Total {clp(total)} <span className="text-[12px] font-semibold text-[color:var(--muted)]">· {clp(Math.round(total / Math.max(1, form.pax)))} por persona</span></p>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-[12.5px] font-semibold">Incluye (una línea por ítem)</label>
              <textarea className="crm-field block w-full" rows={5} disabled={!editable} value={form.includesText ?? ""} onChange={(e) => set("includesText", e.target.value)} />
            </div>
            <div>
              <label className="block text-[12.5px] font-semibold">No incluye</label>
              <textarea className="crm-field block w-full" rows={5} disabled={!editable} value={form.excludesText ?? ""} onChange={(e) => set("excludesText", e.target.value)} />
            </div>
          </div>
          <div className="crm-section">Itinerario de viaje</div>
          <label className="block text-[12.5px] font-semibold">Vuelos (aerolínea, horarios, escalas…)</label>
          <textarea className="crm-field block w-full" rows={3} disabled={!editable} placeholder="Ej: LA 800 Santiago → Madrid, sale 21:30 · regreso 12-mar" value={form.flightsText ?? ""} onChange={(e) => set("flightsText", e.target.value)} />
          <p className="mb-2 mt-3 text-[12.5px] font-semibold">Día por día</p>
          {form.itinerary.length === 0 && !editable && <p className="text-[12.5px] text-[color:var(--muted)]">Esta versión no tiene itinerario.</p>}
          {form.itinerary.map((d, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_auto] items-start gap-2 rounded-lg border border-[var(--border)] p-2">
              <div>
                <input className="crm-field block w-full" placeholder="Título del día (ej: Día 2 · Capadocia)" disabled={!editable} value={d.title} onChange={(e) => setDay(i, { title: e.target.value })} />
                <textarea className="crm-field mt-1 block w-full" rows={3} placeholder="Qué se hace ese día: traslados, visitas, comidas, hotel…" disabled={!editable} value={d.detail} onChange={(e) => setDay(i, { detail: e.target.value })} />
              </div>
              {editable && (
                <div className="flex flex-col gap-1">
                  <button type="button" className="crm-btn" aria-label="Subir día" disabled={i === 0} onClick={() => moveDay(i, i - 1)}><ArrowUp size={14} /></button>
                  <button type="button" className="crm-btn" aria-label="Bajar día" disabled={i === form.itinerary.length - 1} onClick={() => moveDay(i, i + 1)}><ArrowDown size={14} /></button>
                  <button type="button" className="crm-btn" aria-label="Quitar día" onClick={() => set("itinerary", form.itinerary.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                </div>
              )}
            </div>
          ))}
          {editable && (
            <button type="button" className="crm-btn" onClick={() => set("itinerary", [...form.itinerary, emptyDay(form.itinerary.length + 1)])}>
              <Plus size={14} /> Agregar día
            </button>
          )}
          {form.changeReason && <p className="mt-3 text-[12.5px] text-[color:var(--muted)]">Motivo de esta versión: {form.changeReason}</p>}

          {editable && (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className="crm-btn" disabled={busy} onClick={() => call(`/api-quotations.php?action=save&versionId=${form.id}`, body, "Borrador guardado", form.id)}>
                Guardar borrador
              </button>
              <button
                type="button"
                className="crm-btn primary"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm(`Marcar la versión ${form.label} como enviada? Después no se podrá editar; los cambios irán en una versión nueva.`)) return;
                  const saved = await call(`/api-quotations.php?action=save&versionId=${form.id}`, body, "", form.id);
                  if (saved) await call(`/api-quotations.php?action=send&versionId=${form.id}`, {}, `Versión ${form.label} marcada como enviada`, form.id);
                }}
              >
                Marcar como enviada
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
