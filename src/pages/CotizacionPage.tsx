import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import { useCrm } from "@/contexts/CrmContext";
import { PedirDatos } from "@/components/crm/PedirDatos";
import { clp, fecha, fechaHora, plazoCot } from "@/lib/crm";
import type { ItineraryDay, Quotation, QuotationLine, QuotationVersion } from "@/lib/types";
import { hasOriginPlaceholder, parseItinerary, replaceOrigin } from "@/lib/itinerario";
import { revisarCotizacion } from "@/lib/revision";
import { VuelosEditor } from "@/components/crm/VuelosEditor";
import { CatalogoItinerarios, type CatalogExtras } from "@/components/crm/CatalogoItinerarios";

const emptyLine = (): QuotationLine => ({ title: "", detail: "", amountClp: 0 });
const DEFAULT_INCLUDES_TEXT = "Asesoría personalizada antes y durante el viaje";
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
  // Pegar un itinerario completo: se separa solo en días y se revisa antes de aceptar.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteOrigin, setPasteOrigin] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  // Tipo de cambio del sistema (el mismo de los precios de paquetes): permite escribir montos en dólares.
  const [fx, setFx] = useState<{ rate: number; step: number } | null>(null);
  useEffect(() => {
    apiGet<{ rate: number | null; step: number }>("/api-pricing.php?action=settings").then((r) => { if (r.ok && r.rate) setFx({ rate: r.rate, step: r.step || 1 }); });
  }, []);
  // Dólar con que se calculan los montos en USD: el que escribió quien cotiza, o el automático del sistema.
  const tasaEfectiva = form?.fxManualRate ?? fx?.rate ?? 0;
  const clpDeUsd = (usd: number, tasa = tasaEfectiva) => (fx && tasa > 0 ? Math.round((usd * tasa) / fx.step) * fx.step : 0);
  const recalcLineas = (lines: QuotationLine[], tasa: number) => lines.map((l) => (l.amountUsd != null && l.amountUsd > 0 ? { ...l, amountClp: clpDeUsd(l.amountUsd, tasa) } : l));

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
  const avisos = editable ? revisarCotizacion(form, total, undefined, fx?.rate ?? null) : [];
  const enviada = form.status === "enviada";
  const pasos = [
    { n: 1, text: "Datos y montos", done: enviada || total > 0 },
    { n: 2, text: "Itinerario y vuelos", done: enviada || (form.itinerary.length > 0 && (form.flights.length > 0 || !!(form.flightsText ?? "").trim())) },
    { n: 3, text: "Revisar el PDF", done: enviada, href: `/cotizacion/${form.id}/pdf`, link: "Abrir PDF" },
    { n: 4, text: "Enviar por correo", done: enviada, href: `/cotizacion/${form.id}/pdf`, link: "Ir a enviar" },
    { n: 5, text: "Marcar como enviada", done: enviada },
  ];
  const pasoActual = enviada ? -1 : pasos.findIndex((x) => !x.done);
  const parsed = pasteOpen && pasteText.trim() ? parseItinerary(pasteText) : null;
  const parsedDays = parsed ? replaceOrigin(parsed.days, pasteOrigin) : [];
  const pickFromCatalog = (days: ItineraryDay[], pkg: { id: string; title: string }, mode: "replace" | "append", extras: CatalogExtras) => {
    if (mode === "replace" && form.itinerary.length > 0 && !window.confirm("Se reemplazarán los días que ya tiene esta cotización. ¿Continuar?")) return;
    setForm({
      ...form,
      ...(extras.title ? { title: extras.title } : {}),
      ...(extras.includes !== undefined ? { includesText: extras.includes } : {}),
      ...(extras.excludes !== undefined ? { excludesText: extras.excludes } : {}),
      itinerary: mode === "replace" ? days : [...form.itinerary, ...days],
      itineraryPackageId: mode === "append" && form.itineraryPackageId ? form.itineraryPackageId : pkg.id,
      itineraryPackageTitle: mode === "append" && form.itineraryPackageId ? form.itineraryPackageTitle : pkg.title,
    });
    setCatalogOpen(false);
    setMsg({ ok: true, text: `Itinerario «${pkg.title}» cargado (${days.length} días). Ajústalo si hace falta y pulsa «Guardar borrador».` });
  };
  const saveVariant = async () => {
    const name = window.prompt("Nombre del nuevo itinerario (se guarda en el catálogo como borrador):", `${form.title || "Itinerario"} (variante)`);
    if (!name || !name.trim()) return;
    setBusy(true);
    setMsg(null);
    const saved = await apiPost<{ quotation: Quotation }>(`/api-quotations.php?action=save&versionId=${form.id}`, body);
    if (!saved.ok) { setBusy(false); return setMsg({ ok: false, text: saved.error }); }
    const res = await apiPost<{ packageId: string }>(`/api-quotations.php?action=save_variant&versionId=${form.id}`, { title: name.trim() });
    setBusy(false);
    apply(saved.quotation, form.id);
    setMsg(res.ok ? { ok: true, text: `Itinerario guardado en el catálogo como borrador: «${name.trim()}». Lo encuentras al elegir del catálogo.` } : { ok: false, text: res.error });
  };
  const closePaste = () => { setPasteOpen(false); setPasteText(""); setPasteOrigin(""); };
  const acceptDays = (mode: "replace" | "append") => {
    setForm({ ...form, itinerary: mode === "replace" ? parsedDays : [...form.itinerary, ...parsedDays], itineraryPackageId: mode === "replace" ? null : form.itineraryPackageId, itineraryPackageTitle: mode === "replace" ? null : form.itineraryPackageTitle });
    setMsg({ ok: true, text: `${parsedDays.length} día${parsedDays.length === 1 ? "" : "s"} cargado${parsedDays.length === 1 ? "" : "s"}. Revisa el resultado y pulsa «Guardar borrador».` });
    closePaste();
  };

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
      <ol className="mb-3 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" aria-label="Pasos de la cotización">
        {pasos.map((x, i) => (
          <li key={x.n} className={i === pasoActual ? "font-bold" : "text-[color:var(--muted)]"}>
            {x.done ? "✔" : i === pasoActual ? "➜" : "○"} {x.n}. {x.text}
            {x.href && (
              <> · <a className="underline" href={x.href} target="_blank" rel="noreferrer">{x.link}</a></>
            )}
          </li>
        ))}
      </ol>
      <p className="mb-3 text-[12px] text-[color:var(--muted)]">
        Los botones <b>«Enviar al correo»</b> y <b>«Enviar al cliente»</b> están en la pantalla del PDF. Después de enviar, vuelve aquí y pulsa <b>«Marcar como enviada»</b>.
      </p>

      <div className="mb-3"><PedirDatos requestId={requestId} /></div>

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
            <div key={i} className="mb-2 grid grid-cols-[1fr_240px_auto] items-start gap-2">
              <div>
                <input className="crm-field block w-full" placeholder="Servicio (vuelos, hotel…)" disabled={!editable} value={l.title} onChange={(e) => setLine(i, { title: e.target.value })} />
                <input className="crm-field mt-1 block w-full" placeholder="Detalle" disabled={!editable} value={l.detail} onChange={(e) => setLine(i, { detail: e.target.value })} />
              </div>
              <div>
                <div className="flex gap-1">
                  <select
                    className="crm-field"
                    style={{ width: 92, flex: "none" }}
                    aria-label="Moneda del monto"
                    disabled={!editable || (!fx && l.amountUsd == null)}
                    value={l.amountUsd != null ? "USD" : "CLP"}
                    onChange={(e) => e.target.value === "USD" ? setLine(i, { amountUsd: 0, amountClp: 0 }) : setLine(i, { amountUsd: null })}
                  >
                    <option value="CLP">CLP</option>
                    <option value="USD">USD</option>
                  </select>
                  {l.amountUsd != null ? (
                    <input className="crm-field block w-full" type="number" min={0} step="0.01" placeholder="Monto USD" disabled={!editable} value={l.amountUsd || ""} onChange={(e) => { const u = Math.max(0, Number(e.target.value) || 0); setLine(i, { amountUsd: u, amountClp: clpDeUsd(u) }); }} />
                  ) : (
                    <input className="crm-field block w-full" inputMode="numeric" placeholder="Monto CLP" disabled={!editable} value={l.amountClp || ""} onChange={(e) => setLine(i, { amountClp: Number(e.target.value.replace(/\D/g, "")) })} />
                  )}
                </div>
                {l.amountUsd != null && l.amountUsd > 0 && (
                  <p className="mt-0.5 text-[11.5px] text-[color:var(--muted)]">= {clp(l.amountClp)} {fx && editable ? `· dólar $${tasaEfectiva.toLocaleString("es-CL")}${form.fxManualRate != null ? " (manual)" : ""}` : ""}</p>
                )}
              </div>
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
          {form.lines.some((l) => l.amountUsd != null) && editable && fx && (
            <div className="mt-1 flex flex-col items-end gap-1 text-[12.5px]">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={form.fxManualRate != null}
                  onChange={(e) => {
                    const tasa = e.target.checked ? fx.rate : null;
                    setForm({ ...form, fxManualRate: tasa, lines: recalcLineas(form.lines, tasa ?? fx.rate) });
                  }}
                />
                Usar un dólar distinto al del sistema
              </label>
              {form.fxManualRate != null && (
                <label className="flex items-center gap-1.5">
                  Dólar (CLP por USD)
                  <input
                    className="crm-field"
                    style={{ width: 110 }}
                    type="number"
                    min={100}
                    max={5000}
                    step="0.01"
                    value={form.fxManualRate || ""}
                    onChange={(e) => {
                      const t = Number(e.target.value) || 0;
                      setForm({ ...form, fxManualRate: t, lines: recalcLineas(form.lines, t) });
                    }}
                  />
                </label>
              )}
            </div>
          )}
          {form.lines.some((l) => l.amountUsd != null && l.amountUsd > 0) && (
            <p className="text-right text-[12px] text-[color:var(--muted)]">
              {editable
                ? !fx ? "No hay tipo de cambio disponible."
                  : form.fxManualRate != null ? `Los montos en USD se calculan con el dólar que escribiste ($${form.fxManualRate.toLocaleString("es-CL")}), redondeado a $${fx.step.toLocaleString("es-CL")}. Quedará registrado como dólar manual al guardar.`
                  : `Los montos en USD se calculan con el dólar automático del sistema ($${fx.rate.toLocaleString("es-CL")}, redondeado a $${fx.step.toLocaleString("es-CL")}). Quedará registrado al guardar.`
                : form.fxUsdClp ? `Montos en USD calculados ${form.fxManualRate != null ? "con un dólar ingresado manualmente" : "al dólar"} de $${form.fxUsdClp.toLocaleString("es-CL")}${form.fxDate ? ` (${form.fxDate})` : ""}.` : ""}
            </p>
          )}
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
          <VuelosEditor flights={form.flights} editable={editable} onChange={(f) => set("flights", f)} />
          <label className="mt-2 block text-[12.5px] font-semibold">Notas de vuelos (opcional)</label>
          <textarea className="crm-field block w-full" rows={3} disabled={!editable} placeholder="Ej: LA 800 Santiago → Madrid, sale 21:30 · regreso 12-mar" value={form.flightsText ?? ""} onChange={(e) => set("flightsText", e.target.value)} />
          <div className="mb-2 mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] font-semibold">Día por día</p>
            {editable && !pasteOpen && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="crm-btn" onClick={() => setCatalogOpen(true)}>
                  Elegir del catálogo
                </button>
                <button type="button" className="crm-btn" onClick={() => setPasteOpen(true)}>
                  Pegar itinerario completo
                </button>
              </div>
            )}
          </div>
          {editable && pasteOpen && (
            <div className="mb-3 rounded-lg border border-[var(--border)] p-3">
              <label className="block text-[12.5px] font-semibold">Pega aquí el itinerario completo</label>
              <p className="text-[12px] text-[color:var(--muted)]">
                Cada día debe empezar con su encabezado, por ejemplo «lunes, 4 de enero de 2027: MADRID (H)» (también sirve «Día 1: …»). La app los separa sola.
              </p>
              <textarea
                className="crm-field mt-1 block w-full"
                rows={8}
                autoFocus
                placeholder="Pega el texto del itinerario…"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              {parsed && parsedDays.length === 0 && (
                <div className="mt-2 text-[13px]">
                  <p className="text-[color:var(--risk)]">No reconocí los encabezados de los días. Puedes cargarlo igual como un solo bloque y dividirlo a mano.</p>
                  <button
                    type="button"
                    className="crm-btn mt-1"
                    onClick={() => {
                      set("itinerary", [...form.itinerary, { title: "Itinerario de viaje", detail: pasteText.trim().slice(0, 20000) }]);
                      closePaste();
                    }}
                  >
                    Cargar como un solo bloque
                  </button>
                </div>
              )}
              {parsed && parsedDays.length > 0 && (
                <div className="mt-2">
                  <p className="text-[13px] font-semibold">Se separaron {parsedDays.length} día{parsedDays.length === 1 ? "" : "s"}{parsed.usedFallback ? " (por «Día N»)" : ""}. Revísalos:</p>
                  {parsed.ignoredBefore && (
                    <p className="text-[12px] text-[color:var(--muted)]">Se ignoró el texto que había antes del primer día: «{parsed.ignoredBefore.slice(0, 80)}{parsed.ignoredBefore.length > 80 ? "…" : ""}»</p>
                  )}
                  {hasOriginPlaceholder(parsed.days) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">
                      <span>El texto dice «CIUDAD DE ORIGEN». Reemplazar por:</span>
                      <input className="crm-field" style={{ maxWidth: 200 }} placeholder="Ej: Santiago" value={pasteOrigin} onChange={(e) => setPasteOrigin(e.target.value)} />
                    </div>
                  )}
                  <ul className="mt-2 max-h-60 overflow-auto text-[12.5px]">
                    {parsedDays.map((d, i) => (
                      <li key={i} className="border-b border-[var(--border)] py-1">
                        <b>{d.title}</b>
                        <span className="text-[color:var(--muted)]"> · {d.detail.length} caracteres{d.detail.length === 0 ? " (sin descripción)" : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" className="crm-btn" onClick={closePaste}>Cancelar</button>
                {parsedDays.length > 0 && form.itinerary.length > 0 && (
                  <button type="button" className="crm-btn" onClick={() => acceptDays("append")}>Agregar al final</button>
                )}
                {parsedDays.length > 0 && (
                  <button
                    type="button"
                    className="crm-btn primary"
                    onClick={() => {
                      if (form.itinerary.length > 0 && !window.confirm("Se reemplazarán los días que ya tiene esta cotización. ¿Continuar?")) return;
                      acceptDays("replace");
                    }}
                  >
                    {form.itinerary.length > 0 ? "Reemplazar el día por día" : "Usar estos días"}
                  </button>
                )}
              </div>
            </div>
          )}
          {form.itineraryPackageTitle && form.itinerary.length > 0 && (
            <p className="mb-2 text-[12px] text-[color:var(--muted)]">Itinerario basado en el paquete «{form.itineraryPackageTitle}».</p>
          )}
          {form.itinerary.length === 0 && !editable && <p className="text-[12.5px] text-[color:var(--muted)]">Esta versión no tiene itinerario.</p>}
          {form.itinerary.map((d, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_auto] items-start gap-2 rounded-lg border border-[var(--border)] p-2">
              <div>
                <input className="crm-field block w-full" placeholder="Título del día (ej: Día 2 · Capadocia)" disabled={!editable} value={d.title} onChange={(e) => setDay(i, { title: e.target.value })} />
                <textarea className="crm-field mt-1 block w-full" rows={Math.max(3, Math.min(12, Math.ceil(d.detail.length / 85)))} placeholder="Qué se hace ese día: traslados, visitas, comidas, hotel…" disabled={!editable} value={d.detail} onChange={(e) => setDay(i, { detail: e.target.value })} />
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
            <div className="flex flex-wrap gap-2">
              <button type="button" className="crm-btn" onClick={() => set("itinerary", [...form.itinerary, emptyDay(form.itinerary.length + 1)])}>
                <Plus size={14} /> Agregar día
              </button>
              {canPackage && form.itinerary.length > 0 && (
                <button type="button" className="crm-btn" disabled={busy} onClick={saveVariant}>
                  Guardar este itinerario como paquete nuevo
                </button>
              )}
            </div>
          )}
          {catalogOpen && <CatalogoItinerarios hasDays={form.itinerary.length > 0} hasCustomLists={!!form.includesText?.trim() && form.includesText.trim() !== DEFAULT_INCLUDES_TEXT} onPick={pickFromCatalog} onClose={() => setCatalogOpen(false)} />}
          {form.changeReason && <p className="mt-3 text-[12.5px] text-[color:var(--muted)]">Motivo de esta versión: {form.changeReason}</p>}

          {editable && (
            <div className="mt-4 rounded-lg border border-[var(--border)] p-3 text-[12.5px]" aria-live="polite">
              <p className="font-semibold">Revisión antes de enviar</p>
              {avisos.length === 0 ? (
                <p className="text-[color:var(--ok)]">✔ Todo en orden: montos, vigencia, itinerario y vuelos están cargados.</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {avisos.map((a, i) => (
                    <li key={i} className={a.level === "importante" ? "text-[color:var(--risk)]" : "text-[color:var(--muted)]"}>
                      {a.level === "importante" ? "● " : "○ "}{a.text}
                    </li>
                  ))}
                </ul>
              )}
              {avisos.length > 0 && <p className="mt-1 text-[11.5px] text-[color:var(--muted)]">● importante · ○ revisar. Son avisos: no te impiden guardar ni enviar.</p>}
            </div>
          )}
          {editable && (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {form.itinerary.length > 0 && (
                <button
                  type="button"
                  className="crm-btn"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(`Se quitarán los ${form.itinerary.length} día${form.itinerary.length === 1 ? "" : "s"} del itinerario de esta cotización. Los vuelos no se tocan. Nada se borra definitivamente hasta que pulses «Guardar borrador». ¿Continuar?`)) return;
                    setForm({ ...form, itinerary: [], itineraryPackageId: null, itineraryPackageTitle: null });
                    setMsg({ ok: true, text: "Itinerario limpiado. Pulsa «Guardar borrador» para confirmar, o recarga la página para deshacerlo." });
                  }}
                >
                  Limpiar todo el itinerario
                </button>
              )}
              <button type="button" className="crm-btn" disabled={busy} onClick={() => call(`/api-quotations.php?action=save&versionId=${form.id}`, body, "Borrador guardado", form.id)}>
                Guardar borrador
              </button>
              <button
                type="button"
                className="crm-btn primary"
                disabled={busy}
                onClick={async () => {
                  const lista = avisos.length ? `\n\nAntes de enviar, revisa:\n${avisos.map((a) => "• " + a.text).join("\n")}\n\n` : " ";
                  if (!window.confirm(`Marcar la versión ${form.label} como enviada?${lista}Después no se podrá editar; los cambios irán en una versión nueva.`)) return;
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
