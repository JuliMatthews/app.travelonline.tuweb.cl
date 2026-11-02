import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, X } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import { BRAND_LABEL, clp, fecha, fechaLarga } from "@/lib/crm";
import type { QuotationPrint } from "@/lib/types";

// Datos reales de la empresa (mismos del pie de página del sitio público).
const EMPRESA = {
  razon: "Travel Online SPA",
  direccion: "Galvarino Gallardo 1941, Providencia, Santiago",
  grupo: "Parte del Grupo Chirak Turismo",
  telefono: "+56 2 3366 1174",
  whatsapp: "+56 9 8199 1292",
  correo: "reservas@travelonline.cl",
  horario: "L-V 10-14 h y 15-18 h · Sáb 10-14 h",
};

const CSS = `
@page { size: A4; margin: 0 }
.pdf-bg { background: #e9edf3; min-height: 100vh; padding: 24px 0; font-family: "Plus Jakarta Sans", system-ui, sans-serif; color: #1b2433 }
.pdf-sheet { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fbfaf9; display: flex; flex-direction: column; box-shadow: 0 8px 30px rgb(20 30 50 / .18); -webkit-print-color-adjust: exact; print-color-adjust: exact }
.pdf-head { background: linear-gradient(120deg, #2d4874 0%, #406e81 100%); color: #fff; padding: 26px 34px 22px; position: relative; overflow: hidden }
.pdf-head::after { content: ""; position: absolute; right: -60px; top: -80px; width: 260px; height: 260px; border-radius: 50%; background: rgb(218 185 177 / .18) }
.pdf-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; position: relative; z-index: 1 }
.pdf-logo { display: flex; align-items: center; gap: 10px; font-size: 23px; font-weight: 800; letter-spacing: -.4px }
.pdf-empresa { font-size: 10.5px; line-height: 1.55; opacity: .88; margin-top: 8px }
.pdf-num { text-align: right }
.pdf-num small { display: block; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; opacity: .8 }
.pdf-num b { display: block; font-size: 30px; line-height: 1.1; font-weight: 800; color: #dab9b1 }
.pdf-num span { font-size: 11px; opacity: .9 }
.pdf-body { padding: 24px 34px 8px; flex: 1 }
.pdf-cards { display: grid; grid-template-columns: 1fr 1.4fr; gap: 14px }
.pdf-card { background: #fff; border: 1px solid #e3e7ee; border-radius: 14px; padding: 13px 16px }
.pdf-card h4 { margin: 0 0 5px; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: #99634f }
.pdf-card p { margin: 0; font-size: 13px; line-height: 1.5 }
.pdf-title { margin: 22px 0 2px; font-size: 22px; font-weight: 800; color: #2d4874; letter-spacing: -.4px }
.pdf-sub { margin: 0 0 12px; color: #6b7385; font-size: 12.5px }
.pdf-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 14px; overflow: hidden; border: 1px solid #e3e7ee }
.pdf-table th { background: #eef2f7; text-align: left; font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase; color: #2d4874; padding: 9px 16px }
.pdf-table td { padding: 11px 16px; border-top: 1px solid #edf0f5; font-size: 13px; vertical-align: top }
.pdf-table td.n, .pdf-table th.n { text-align: right; white-space: nowrap }
.pdf-table .d { display: block; color: #6b7385; font-size: 11.5px; margin-top: 2px }
.pdf-totals { margin: 14px 0 0 auto; width: 62%; font-size: 13px }
.pdf-totals div { display: flex; justify-content: space-between; padding: 4px 4px }
.pdf-total { margin-top: 8px; background: linear-gradient(120deg, #2d4874, #406e81); color: #fff; border-radius: 14px; padding: 13px 18px !important; align-items: center; font-size: 15px }
.pdf-total b { font-size: 24px; font-weight: 800 }
.pdf-pp { text-align: right; color: #6b7385; font-size: 11.5px; margin: 5px 4px 0 }
.pdf-lists { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 20px }
.pdf-list { border-radius: 14px; padding: 13px 16px }
.pdf-list.ok { background: rgb(143 159 131 / .16) }
.pdf-list.no { background: rgb(218 185 177 / .28) }
.pdf-list h4 { margin: 0 0 7px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #2d4874 }
.pdf-list li { list-style: none; display: flex; gap: 7px; font-size: 12.5px; line-height: 1.45; margin-bottom: 4px }
.pdf-list ul { margin: 0; padding: 0 }
.pdf-list svg { flex: none; margin-top: 2px }
.pdf-itin { margin-top: 20px; background: #fff; border: 1px solid #e3e7ee; border-radius: 14px; padding: 14px 18px }
.pdf-itin h4 { margin: 0 0 8px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #2d4874 }
.pdf-flights { background: #eef2f7; border-radius: 10px; padding: 9px 12px; font-size: 12.5px; line-height: 1.5; white-space: pre-line; margin-bottom: 8px }
.pdf-day { margin-top: 9px; break-inside: avoid; border-left: 3px solid #dab9b1; padding-left: 12px }
.pdf-day b { display: block; font-size: 13px; color: #2d4874 }
.pdf-day p { margin: 2px 0 0; font-size: 12.5px; line-height: 1.5; white-space: pre-line }
.pdf-valid { margin: 20px 0 0; padding: 11px 16px; border-left: 4px solid #99634f; background: #fff; border-radius: 0 10px 10px 0; font-size: 12px; line-height: 1.5 }
.pdf-foot { background: #1c2c47; color: #cfd8e6; padding: 22px 34px 14px; margin-top: 24px; font-size: 10.5px; line-height: 1.6 }
.pdf-foot-in { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 24px }
.pdf-foot h5 { margin: 0 0 5px; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: #dab9b1 }
.pdf-foot .lg { display: flex; align-items: center; gap: 8px; color: #fff; font-weight: 800; font-size: 15px; margin-bottom: 5px }
.pdf-legal { margin-top: 14px; padding-top: 9px; border-top: 1px solid rgb(255 255 255 / .14); display: flex; justify-content: space-between; opacity: .75; font-size: 9.5px }
.pdf-bar { width: 210mm; max-width: 100%; margin: 0 auto 16px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px }
.pdf-bar > div { background: #fff; border: 1px solid #d5dbe5; border-radius: 14px; padding: 12px 14px; text-align: center }
.pdf-bar button { width: 100%; padding: 10px 12px; border-radius: 22px; border: 0; background: #2d4874; color: #fff; font-weight: 700; font-size: 13px; cursor: pointer }
.pdf-bar button.alt { background: #406e81 }
.pdf-bar button.warn { background: #99634f }
.pdf-bar button:disabled { opacity: .5; cursor: not-allowed }
.pdf-bar small { display: block; margin-top: 7px; font-size: 11px; line-height: 1.4; color: #6b7385 }
.pdf-flash { width: 210mm; max-width: 100%; margin: 0 auto 12px; padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 600 }
@media print { .pdf-bg { background: none; padding: 0 } .pdf-sheet { box-shadow: none; width: 100%; min-height: 297mm } .no-print { display: none !important } }
`;

function Globe({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="2 4 28 24" width={size} height={size} aria-hidden="true">
      <defs>
        <radialGradient id="pg" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#9bc3d6" />
          <stop offset="60%" stopColor="#5f8fa6" />
          <stop offset="100%" stopColor="#2d4874" />
        </radialGradient>
      </defs>
      <ellipse cx="16" cy="16" rx="15" ry="6" fill="none" stroke="#dab9b1" strokeWidth="1" transform="rotate(-18 16 16)" />
      <circle cx="16" cy="16" r="10" fill="url(#pg)" stroke="#fff" strokeOpacity=".5" />
      <path d="M9 12c2-2 4-2 5 0s-1 3 0 4-2 3-3 2-3-3-2-6zM17 18c2-1 4 0 3 2s-2 3-3 2 0-3 0-4zM18 10c2-1 4 0 4 2s-2 2-3 2-2-3-1-4z" fill="#a9c29b" />
      <path d="M26 11.5l2.2.4-1.3 1.2-2-.4z" fill="#fff" />
    </svg>
  );
}

// Hoja imprimible (A4) de UNA versión de la cotización. "Guardar como PDF" en el diálogo de
// impresión del navegador (gratis, sin librerías). Usa la paleta y el pie del sitio público.
export default function CotizacionPdfPage() {
  const { versionId } = useParams<{ versionId: string }>();
  const [data, setData] = useState<QuotationPrint | null | undefined>(undefined);
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiGet<QuotationPrint>(`/api-quotations.php?action=print&versionId=${versionId}`).then((res) => setData(res.ok ? res : null));
  }, [versionId]);

  if (data === undefined) return <p style={{ padding: 24 }}>Cargando…</p>;
  if (data === null) return <p style={{ padding: 24 }}>No se pudo cargar la cotización (¿iniciaste sesión?).</p>;

  const { version: v, request: r } = data;
  const canSend = can(user, "quotes:edit");

  async function send(target: "review" | "client") {
    if (target === "client" && !window.confirm(`Se enviará la cotización ${v.label} a ${r.passengerEmail}. ¿Confirmas que el presupuesto cumple lo exigido?`)) return;
    setBusy(true);
    setFlash(null);
    const res = await apiPost(`/api-quotations.php?action=email&versionId=${v.id}`, { target });
    setBusy(false);
    setFlash(
      res.ok
        ? { ok: true, text: target === "review" ? `Enviada a ${data!.reviewTo} para revisión.` : `Enviada al cliente (${r.passengerEmail}).` }
        : { ok: false, text: res.error }
    );
  }
  const subtotal = v.lines.reduce((a, l) => a + l.amountClp, 0);
  const items = (t: string | null) => (t ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  const label = v.version <= 1 ? String(v.number) : `${v.number}.${v.version - 1}`;
  const inc = items(v.includesText);
  const exc = items(v.excludesText);

  return (
    <div className="pdf-bg">
      <style>{CSS}</style>
      <div className="pdf-bar no-print">
        <div>
          <button type="button" onClick={() => window.print()}>Imprimir / Guardar PDF</button>
          <small>Descarga esta cotización como archivo PDF.</small>
        </div>
        {canSend ? (
          <>
            <div>
              <button type="button" className="alt" disabled={busy || !data.reviewTo} onClick={() => send("review")}>
                Enviar al correo {data.reviewTo}
              </button>
              <small>(Podrá revisar el PDF con más calma antes de enviar al cliente)</small>
            </div>
            <div>
              <button type="button" className="warn" disabled={busy || !r.passengerEmail} onClick={() => send("client")}>
                Enviar al cliente
              </button>
              <small>(Solo si está seguro de que el PPTO cumple con lo exigido)</small>
            </div>
          </>
        ) : (
          <div style={{ gridColumn: "span 2" }}><small>Tu rol no permite enviar cotizaciones.</small></div>
        )}
      </div>
      {flash && (
        <div className="pdf-flash no-print" style={{ background: flash.ok ? "#e5efe0" : "#f6e0dc", color: flash.ok ? "#3d5a2f" : "#8a3c2d" }}>
          {flash.text}
        </div>
      )}
      <div className="pdf-sheet">
        <header className="pdf-head">
          <div className="pdf-top">
            <div>
              <div className="pdf-logo">
                <Globe size={36} /> {BRAND_LABEL[r.brand]}
              </div>
              <div className="pdf-empresa">
                {EMPRESA.razon} · {EMPRESA.grupo}
                <br />
                {EMPRESA.direccion}
                <br />
                {EMPRESA.telefono} · {EMPRESA.correo}
              </div>
            </div>
            <div className="pdf-num">
              <small>Cotización N°</small>
              <b>{label}</b>
              <span>
                {r.folio ?? ""} · {fechaLarga(v.sentAt ?? v.createdAt)}
                {v.status === "borrador" && " · BORRADOR"}
              </span>
            </div>
          </div>
        </header>

        <div className="pdf-body">
          <div className="pdf-cards">
            <div className="pdf-card">
              <h4>Preparada para</h4>
              <p>
                <b>{r.passengerName}</b>
                {r.passengerEmail && <><br />{r.passengerEmail}</>}
              </p>
            </div>
            <div className="pdf-card">
              <h4>Viaje</h4>
              <p>
                <b>{v.title}</b>
                {v.subtitle && <><br />{v.subtitle}</>}
                <br />
                {v.pax} pasajero{v.pax === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <h2 className="pdf-title">Detalle de tu propuesta</h2>
          <p className="pdf-sub">Valores en pesos chilenos (CLP).</p>
          <table className="pdf-table">
            <thead>
              <tr><th>Servicio</th><th className="n">Valor</th></tr>
            </thead>
            <tbody>
              {v.lines.map((l, i) => (
                <tr key={i}>
                  <td><b>{l.title}</b>{l.detail && <span className="d">{l.detail}</span>}</td>
                  <td className="n">{clp(l.amountClp)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pdf-totals">
            {v.discountClp > 0 && (
              <>
                <div><span>Subtotal</span><span>{clp(subtotal)}</span></div>
                <div><span>{v.discountLabel || "Descuento"}</span><span>− {clp(v.discountClp)}</span></div>
              </>
            )}
            <div className="pdf-total"><span>Total</span><b>{clp(v.totalClp)}</b></div>
            <p className="pdf-pp">{clp(Math.round(v.totalClp / Math.max(1, v.pax)))} por persona</p>
          </div>

          {(inc.length > 0 || exc.length > 0) && (
            <div className="pdf-lists">
              <div className="pdf-list ok">
                <h4>Incluye</h4>
                <ul>{inc.map((t, i) => <li key={i}><Check size={14} color="#4d6b3f" />{t}</li>)}</ul>
              </div>
              <div className="pdf-list no">
                <h4>No incluye</h4>
                <ul>{exc.map((t, i) => <li key={i}><X size={14} color="#99634f" />{t}</li>)}</ul>
              </div>
            </div>
          )}

          {(v.itinerary.length > 0 || v.flightsText) && (
            <div className="pdf-itin">
              <h4>Itinerario de viaje</h4>
              {v.flightsText && <div className="pdf-flights"><b>Vuelos</b>{"\n"}{v.flightsText}</div>}
              {v.itinerary.map((d, i) => (
                <div key={i} className="pdf-day">
                  <b>{d.title}</b>
                  {d.detail && <p>{d.detail}</p>}
                </div>
              ))}
            </div>
          )}

          {v.validUntil && (
            <p className="pdf-valid">
              <b>Cotización válida hasta el {fecha(v.validUntil)}.</b> Los valores pueden variar según disponibilidad al momento de confirmar la reserva.
            </p>
          )}
        </div>

        <footer className="pdf-foot">
          <div className="pdf-foot-in">
            <div>
              <div className="lg"><Globe size={26} /> Travel Online</div>
              {EMPRESA.direccion}.<br />{EMPRESA.grupo}.
            </div>
            <div>
              <h5>Contacto</h5>
              {EMPRESA.telefono}<br />WhatsApp {EMPRESA.whatsapp}<br />{EMPRESA.correo}
            </div>
            <div>
              <h5>Horario</h5>
              {EMPRESA.horario}
            </div>
          </div>
          <div className="pdf-legal">
            <span>© {new Date().getFullYear()} {EMPRESA.razon}. Todos los derechos reservados.</span>
            <span>{r.folio ?? ""} · v{label}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
