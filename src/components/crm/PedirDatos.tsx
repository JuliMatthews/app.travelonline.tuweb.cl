import { useEffect, useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import { useCrm } from "@/contexts/CrmContext";
import { BRAND_LABEL } from "@/lib/crm";
import type { QuoteDetail } from "@/lib/types";

// "Pedir datos al cliente": detecta qué le falta a la solicitud, redacta el correo / WhatsApp con la pregunta
// concreta (nombre, folio, destino) y, al abrirlo, deja registrado el contacto y qué se pidió.
// Se usa en la ficha de la solicitud y en la pantalla de cotización (ahí es donde se nota que falta algo).

type Item = { key: string; label: string; ask: string };

// "label" es lo que se anota en el historial; "ask" es la frase dentro del mensaje.
const ITEMS: Item[] = [
  { key: "fecha", label: "fecha de viaje", ask: "¿En qué fecha (o rango de fechas) te gustaría viajar?" },
  { key: "pasajeros", label: "cantidad de pasajeros", ask: "¿Cuántas personas viajan (adultos y niños)?" },
  { key: "edades", label: "edades de los niños", ask: "¿Qué edades tienen los niños que viajan?" },
  { key: "presupuesto", label: "presupuesto", ask: "¿Con qué presupuesto aproximado cuentas para el viaje?" },
  { key: "destino", label: "destino", ask: "¿A qué destino te gustaría viajar?" },
  { key: "origen", label: "ciudad de salida", ask: "¿Desde qué ciudad saldrías?" },
];

const filled = (v: unknown) => typeof v === "string" && v.trim() !== "";

/** Qué datos de la solicitud están vacíos. */
export function missingKeys(q: QuoteDetail): string[] {
  const out: string[] = [];
  const rescuedDate = q.recovery?.mensajes.some((m) => filled(m.fechasViaje));
  if (!q.preferredDateFrom && !filled(q.details.cuando) && !rescuedDate) out.push("fecha");
  if (!(q.adults >= 1)) out.push("pasajeros");
  if (q.children > 0 && !filled(q.details.edades)) out.push("edades");
  if (q.budgetClp == null && !filled(q.budgetRange)) out.push("presupuesto");
  if (!filled(q.destination) && !filled(q.packageTitle)) out.push("destino");
  if (!filled(q.originCity)) out.push("origen");
  return out;
}

function buildMessage(q: QuoteDetail, chosen: Item[], sender: string) {
  const brand = BRAND_LABEL[q.brand];
  const first = q.passengerName.trim().split(" ")[0] || "";
  const dest = q.packageTitle || q.destination;
  const intro = dest
    ? `Gracias por tu interés en ${dest}. Estamos preparando tu cotización (${q.folio ?? "solicitud"}) y, para dejártela lo más ajustada posible, necesitamos que nos confirmes:`
    : `Gracias por escribirnos. Estamos preparando tu cotización (${q.folio ?? "solicitud"}) y, para dejártela lo más ajustada posible, necesitamos que nos confirmes:`;
  const lines = chosen.map((i) => `• ${i.ask}`).join("\n");
  const subject = `Tu cotización ${q.folio ?? ""} · ${brand}`.replace("  ", " ");
  const email = `Hola ${first},\n\n${intro}\n\n${lines}\n\nCon esos datos te enviamos la cotización a la brevedad.\n\nSaludos,\n${sender}\n${brand}`;
  const wsp = `Hola ${first}, te escribe ${sender} de ${brand}. ${intro}\n${lines}\nCon eso te enviamos tu cotización. ¡Gracias!`;
  return { subject, email, wsp };
}

export function PedirDatos({ requestId, quote, onLogged }: { requestId: number; quote?: QuoteDetail; onLogged?: () => void }) {
  const { user } = useAuth();
  const { reload } = useCrm();
  const [q, setQ] = useState<QuoteDetail | null>(quote ?? null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Ventana con el mensaje ya escrito: se lee, se edita y recién entonces se abre Gmail / el correo / WhatsApp, o se copia.
  const [draft, setDraft] = useState<{ medium: "correo" | "whatsapp"; subject: string; body: string } | null>(null);
  const [logged, setLogged] = useState(false);
  const [copied, setCopied] = useState<"" | "mensaje" | "asunto">("");

  useEffect(() => {
    if (quote) setQ(quote);
    else apiGet<{ quote: QuoteDetail }>(`/api-quotes.php?action=get&id=${requestId}`).then((r) => r.ok && setQ(r.quote));
  }, [quote, requestId]);

  if (!q || !can(user, "quotes:edit") || q.alert === "cerrado") return null;

  const missing = missingKeys(q);
  const selected = picked ?? missing;
  const toggle = (k: string) => setPicked(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k]);
  const chosen = ITEMS.filter((i) => selected.includes(i.key));
  const phoneDigits = (q.passengerPhone || "").replace(/\D/g, "");
  const sender = user?.name ?? "el equipo";
  const text = buildMessage(q, chosen, sender);

  function openPreview(medium: "correo" | "whatsapp") {
    if (!q || chosen.length === 0) return;
    setDraft({ medium, subject: text.subject, body: medium === "correo" ? text.email : text.wsp });
    setLogged(false);
    setCopied("");
  }

  // Registra el contacto (una sola vez por mensaje) cuando se elige una opción de la ventana.
  async function registrar(medium: "correo" | "whatsapp") {
    if (logged) return;
    setBusy(true);
    const res = await apiPost(`/api-quotes.php?action=contact&id=${requestId}`, { medium, asked: chosen.map((i) => i.label) });
    setBusy(false);
    if (!res.ok) return setMsg(`No se pudo registrar el contacto: ${res.error}`);
    setLogged(true);
    setMsg("Listo: quedó registrado el contacto y qué se pidió. La alerta de seguimiento volvió a cero.");
    reload();
    onLogged?.();
  }

  async function copiar(texto: string, que: "mensaje" | "asunto") {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const t = document.createElement("textarea");
      t.value = texto;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      document.body.removeChild(t);
    }
    setCopied(que);
  }

  function abrir(via: "gmail" | "correo" | "whatsapp") {
    if (!q || !draft) return;
    // Abrir primero (el navegador solo permite abrir ventanas dentro del clic) y registrar después.
    if (via === "gmail") {
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(q.passengerEmail ?? "")}&su=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`, "_blank", "noopener,noreferrer");
    } else if (via === "correo") {
      window.location.href = `mailto:${q.passengerEmail}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
    } else {
      window.open(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(draft.body)}`, "_blank", "noopener,noreferrer");
    }
    registrar(draft.medium);
  }

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] px-3 py-3">
      <div className="text-[12.5px] font-semibold">
        {missing.length > 0 ? `⚠ Falta información de esta solicitud (${missing.length})` : "✓ La solicitud tiene los datos principales"} · Pedir datos al cliente
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ITEMS.map((i) => {
          const on = selected.includes(i.key);
          const isMissing = missing.includes(i.key);
          return (
            <button
              key={i.key}
              type="button"
              onClick={() => toggle(i.key)}
              className="crm-btn"
              style={on ? { background: "var(--marino-050)", fontWeight: 700 } : undefined}
              aria-pressed={on}
              title={isMissing ? "Falta en la solicitud" : "Ya está en la solicitud"}
            >
              {on ? "☑" : "☐"} {i.label}
              {isMissing ? " ⚠" : ""}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {q.passengerEmail && (
          <button type="button" className="crm-btn primary" disabled={busy || chosen.length === 0} onClick={() => openPreview("correo")}>
            <Mail size={15} /> Pedir por correo
          </button>
        )}
        {phoneDigits && (
          <button type="button" className="crm-btn" disabled={busy || chosen.length === 0} onClick={() => openPreview("whatsapp")}>
            <MessageCircle size={15} /> Pedir por WhatsApp
          </button>
        )}
        {!q.passengerEmail && !phoneDigits && <span className="text-[12.5px] text-[color:var(--muted)]">Este cliente no tiene correo ni teléfono registrado.</span>}
      </div>
      <p className="mt-2 text-[11.5px] text-[color:var(--muted)]">
        Se abre una ventana con el mensaje ya escrito para que lo leas, lo edites si quieres y lo envíes (en Gmail, en tu programa de correo o copiándolo). Al elegir una opción, la app registra el contacto sola.
      </p>
      {msg && <p className="mt-2 text-[12.5px] font-semibold text-[color:var(--ok)]">{msg}</p>}
      {draft && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Mensaje para el cliente" onClick={() => setDraft(null)}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{draft.medium === "correo" ? "Correo" : "WhatsApp"} para {q.passengerName}</h2>
                <p className="text-[12.5px] text-[color:var(--muted)]">
                  {draft.medium === "correo" ? `Para: ${q.passengerEmail}` : `Teléfono: +${phoneDigits}`} · Léelo, edítalo si quieres y elige cómo enviarlo.
                </p>
              </div>
              <button type="button" className="crm-btn" onClick={() => setDraft(null)} aria-label="Cerrar">{logged ? "Cerrar" : "Cancelar"} ✕</button>
            </div>

            {draft.medium === "correo" && (
              <div className="mt-3">
                <label className="block text-[12.5px] font-semibold">Asunto</label>
                <div className="flex gap-2">
                  <input className="crm-field block w-full" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                  <button type="button" className="crm-btn" onClick={() => copiar(draft.subject, "asunto")}>{copied === "asunto" ? "✔ Copiado" : "Copiar"}</button>
                </div>
              </div>
            )}
            <label className="mt-3 block text-[12.5px] font-semibold">Mensaje</label>
            <textarea className="crm-field block w-full" rows={13} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {draft.medium === "correo" ? (
                <>
                  <button type="button" className="crm-btn primary" disabled={busy} onClick={() => abrir("gmail")}><Mail size={15} /> Abrir en Gmail</button>
                  <button type="button" className="crm-btn" disabled={busy} onClick={() => abrir("correo")}>Abrir en mi programa de correo</button>
                </>
              ) : (
                <button type="button" className="crm-btn primary" disabled={busy} onClick={() => abrir("whatsapp")}><MessageCircle size={15} /> Abrir WhatsApp</button>
              )}
              <button type="button" className="crm-btn" disabled={busy} onClick={async () => { await copiar(draft.body, "mensaje"); registrar(draft.medium); }}>
                {copied === "mensaje" ? "✔ Mensaje copiado" : "Copiar mensaje"}
              </button>
            </div>
            <p className="mt-2 text-[12px] text-[color:var(--muted)]">
              {logged
                ? "✔ Contacto registrado. Recuerda enviar el mensaje: el panel no lo envía por ti."
                : "Al elegir una opción, el panel registra el contacto y anota qué datos se pidieron. El mensaje solo sale cuando tú lo envías."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
