import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "@/lib/api";
import { BRAND_LABEL, BRAND_ORDER } from "@/lib/crm";
import type { QuoteBrand } from "@/lib/types";

type Reason = "viaje" | "reunion" | "problema";

const REASONS: { v: Reason; title: string; hint: string; say: string }[] = [
  { v: "viaje", title: "Cotizar un viaje", hint: "Quiere precios o información.", say: "“Voy a anotar qué viaje le interesa para que Carolina prepare su cotización y se comunique con usted.”" },
  { v: "reunion", title: "Pedir una reunión", hint: "Quiere conversar o visitar la oficina.", say: "“Tomaré su solicitud. Carolina le confirmará por correo el día y la hora en que podemos recibirlo.”" },
  { v: "problema", title: "Informar un problema", hint: "Necesita ayuda con un viaje.", say: "“Tomaré sus datos y un breve resumen de lo ocurrido para que Carolina revise el caso y se comunique con usted.”" },
];

const CHANNELS = [
  { v: "telefono", label: "Teléfono" },
  { v: "whatsapp", label: "WhatsApp" },
  { v: "correo", label: "Correo" },
  { v: "instagram", label: "Instagram" },
  { v: "referido", label: "Recomendación" },
  { v: "otro", label: "Otro" },
];

const HELP = [
  { q: "Si pregunta por la oficina", a: "“Primero preparamos una cotización o coordinamos una reunión. Le confirmaremos por correo el día y horario de atención. En la oficina trabaja el área de ventas de Chile; los viajes al extranjero se atienden online.”" },
  { q: "Si cree que somos la agencia del Banco de Chile", a: "“Somos Travel Online, en alianza con Travel Viajes. No somos la agencia de viajes del Banco de Chile.”" },
  { q: "Si me pregunta algo que no sé", a: "“Voy a anotar su pregunta para que la ejecutiva le entregue la información correcta.” No adelantes precios, condiciones ni soluciones." },
];

const EMPTY = {
  channel: "telefono", brand: "travel_online" as QuoteBrand, name: "", phone: "", email: "", originCity: "", destination: "", dates: "",
  adults: "1", children: "0", ages: "", program: "", notes: "", meetingTopic: "", hasQuote: "", availability: "",
  issue: "", agency: "", booking: "", travelling: "", assignedTo: "", referredByEmail: "",
};

// Alta manual de una solicitud (llamada, WhatsApp, correo…): el formulario de recepción de Carolina,
// ahora guardando directo en el CRM con folio, canal e historial.
export default function NuevaSolicitudPage() {
  const navigate = useNavigate();
  const [reason, setReason] = useState<Reason | null>(null);
  const [f, setF] = useState(EMPTY);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<{ users: { id: string; name: string }[] }>("/api-quotes.php?action=users").then((res) => res.ok && setUsers(res.users));
  }, []);

  const set = (k: keyof typeof EMPTY, v: string) => setF({ ...f, [k]: v });
  const field = (k: keyof typeof EMPTY, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, wide = false) => (
    <label className={`block text-[12.5px] font-semibold ${wide ? "md:col-span-2" : ""}`}>
      {label}
      <input className="crm-field mt-1" value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} />
    </label>
  );
  const area = (k: keyof typeof EMPTY, label: string, rows = 3) => (
    <label className="block text-[12.5px] font-semibold md:col-span-2">
      {label}
      <textarea className="crm-field mt-1" rows={rows} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </label>
  );

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await apiPost<{ id: number; folio: string }>("/api-quotes.php?action=create", {
      ...f,
      reason,
      adults: Number(f.adults) || 0,
      children: Number(f.children) || 0,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    navigate(`/solicitudes?id=${res.id}`);
  }

  const current = REASONS.find((r) => r.v === reason);

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/solicitudes" className="mb-3 inline-block text-[13px] font-semibold text-[color:var(--muted)] hover:text-foreground">← Solicitudes</Link>
      <div className="crm-head">
        <div>
          <h1>Nueva solicitud</h1>
          <p>Para lo que llega por teléfono, WhatsApp, correo u otro canal. Queda en el CRM con su folio TOL.</p>
        </div>
      </div>

      <div className="crm-panel mb-4">
        <div className="crm-section !mt-0 !border-0 !pt-0">¿Para qué contacta el pasajero?</div>
        <div className="grid gap-3 md:grid-cols-3">
          {REASONS.map((r) => (
            <button
              key={r.v}
              type="button"
              onClick={() => setReason(r.v)}
              className={`crm-choice ${reason === r.v ? "activo" : ""}`}
              aria-pressed={reason === r.v}
            >
              <b className="block">{r.title}</b>
              <span className="text-[12px] text-[color:var(--muted)]">{r.hint}</span>
              <i className="crm-choice-go" aria-hidden="true">{reason === r.v ? "Elegido ✓" : "Elegir →"}</i>
            </button>
          ))}
        </div>
      </div>

      {current && (
        <div className="crm-panel">
          <p className="mb-4 rounded-lg bg-[var(--mar-050)] px-3 py-2 text-[12.5px]"><b>QUÉ DECIR · </b>{current.say}</p>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-[12.5px] font-semibold">
              Canal por el que llegó
              <select className="crm-field mt-1" value={f.channel} onChange={(e) => set("channel", e.target.value)}>
                {CHANNELS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
              </select>
            </label>
            <label className="block text-[12.5px] font-semibold">
              Marca
              <select className="crm-field mt-1" value={f.brand} onChange={(e) => set("brand", e.target.value)}>
                {BRAND_ORDER.map((b) => <option key={b} value={b}>{BRAND_LABEL[b]}</option>)}
              </select>
            </label>
            {field("name", "Nombre y apellido *", {}, true)}
            {field("phone", "Teléfono / WhatsApp *", { type: "tel" })}
            {field("email", "Correo electrónico", { type: "email" })}

            {reason === "viaje" && (
              <>
                <div className="crm-section md:col-span-2">Pregunta por el viaje</div>
                {field("originCity", "¿Desde qué ciudad sale?")}
                {field("destination", "¿A dónde quiere viajar?")}
                {field("dates", "¿Qué fechas de ida y regreso tiene en mente? (pueden ser aproximadas)", {}, true)}
                {field("adults", "¿Cuántos adultos viajan?", { type: "number", min: 0 })}
                {field("children", "¿Cuántos menores viajan?", { type: "number", min: 0 })}
                {Number(f.children) > 0 && field("ages", "¿Qué edad tiene cada menor?", {}, true)}
                {field("program", "¿Qué circuito, paquete o promoción vio?", { placeholder: "Nombre o enlace, si lo conoce" }, true)}
                {area("notes", "¿Algo más que quiera pedir?", 2)}
              </>
            )}
            {reason === "reunion" && (
              <>
                <div className="crm-section md:col-span-2">Solicitud de reunión</div>
                {area("meetingTopic", "¿Sobre qué viaje o tema quiere conversar?", 2)}
                <label className="block text-[12.5px] font-semibold">
                  ¿Ya recibió una cotización?
                  <select className="crm-field mt-1" value={f.hasQuote} onChange={(e) => set("hasQuote", e.target.value)}>
                    <option value="">No informado</option><option>Sí</option><option>No</option>
                  </select>
                </label>
                {field("availability", "Disponibilidad que indique el pasajero", { placeholder: "Opcional" })}
              </>
            )}
            {reason === "problema" && (
              <>
                <div className="crm-section md:col-span-2">Anota lo ocurrido, sin buscar una solución</div>
                {area("issue", "¿Qué ocurrió? *")}
                {field("agency", "¿Con qué agencia hizo la reserva?", { placeholder: "Si lo sabe" })}
                {field("booking", "Número de reserva", { placeholder: "Si lo tiene" })}
                <label className="block text-[12.5px] font-semibold">
                  ¿Está viajando actualmente?
                  <select className="crm-field mt-1" value={f.travelling} onChange={(e) => set("travelling", e.target.value)}>
                    <option value="">No informado</option><option>Sí</option><option>No</option>
                  </select>
                </label>
              </>
            )}

            <div className="crm-section md:col-span-2">Asignación (opcional)</div>
            <label className="block text-[12.5px] font-semibold">
              Responsable
              <select className="crm-field mt-1" value={f.assignedTo} onChange={(e) => set("assignedTo", e.target.value)}>
                <option value="">Sin asignar</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            {field("referredByEmail", "Referido por (correo de quien lo recomendó)", { type: "email" })}
          </div>

          <div className="mt-4 grid gap-2">
            {HELP.map((h) => (
              <details key={h.q} className="rounded-lg border border-[var(--border)] px-3 py-2 text-[12.5px]">
                <summary className="cursor-pointer font-semibold">{h.q}</summary>
                <p className="mt-1.5">{h.a}</p>
              </details>
            ))}
          </div>

          {error && <p className="mt-3 text-[13px] font-semibold text-[color:var(--risk)]" role="alert">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Link to="/solicitudes" className="crm-btn">Cancelar</Link>
            <button type="button" className="crm-btn primary" disabled={busy} onClick={submit}>Guardar solicitud</button>
          </div>
        </div>
      )}
    </div>
  );
}
