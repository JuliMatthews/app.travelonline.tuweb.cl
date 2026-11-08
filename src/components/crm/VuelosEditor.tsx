import { useMemo, useState } from "react";
import { Plane, Plus, Trash2 } from "lucide-react";
import { AIRLINES, emptyFlight, htmlTableToText, parseFlights, type Flight } from "@/lib/vuelos";

// Vuelos de la cotización: se pega la tabla copiada del portal y queda como datos; lo que no se puede copiar
// (aerolínea y equipaje) se completa a mano. Todo se puede corregir después, vuelo por vuelo.
export function VuelosEditor({ flights, editable, onChange }: { flights: Flight[]; editable: boolean; onChange: (f: Flight[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [year, setYear] = useState("");
  const [airline, setAirline] = useState("");

  const parsed = useMemo(() => (open && text.trim() ? parseFlights(text, { yearOverride: /^\d{4}$/.test(year) ? Number(year) : null }) : null), [open, text, year]);
  const close = () => { setOpen(false); setText(""); setYear(""); setAirline(""); };
  const patch = (i: number, p: Partial<Flight>) => onChange(flights.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const accept = () => {
    if (!parsed || parsed.flights.length === 0) return;
    if (flights.length > 0 && !window.confirm("Se reemplazarán los vuelos que ya tiene esta cotización. ¿Continuar?")) return;
    onChange(parsed.flights.map((f) => ({ ...f, airline: airline.trim() })));
    close();
  };
  const inp = "crm-field block w-full";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] font-semibold">Vuelos</p>
        {editable && !open && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="crm-btn"
              style={{ borderColor: "#f59a3c", borderWidth: 2, fontWeight: 600 }}
              onClick={() => setOpen(true)}
            >
              <Plane size={15} style={{ color: "#f59a3c" }} /> Pegar tabla de vuelos
            </button>
            <button type="button" className="crm-btn" onClick={() => onChange([...flights, emptyFlight()])}><Plus size={14} /> Agregar vuelo</button>
            {flights.length > 0 && (
              <button
                type="button"
                className="crm-btn"
                onClick={() => { if (window.confirm(`Se quitarán los ${flights.length} vuelo${flights.length === 1 ? "" : "s"}. Nada se borra definitivamente hasta que pulses «Guardar borrador». ¿Continuar?`)) onChange([]); }}
              >
                Limpiar vuelos
              </button>
            )}
          </div>
        )}
      </div>

      {editable && open && (
        <div className="mb-3 rounded-lg border border-[var(--border)] p-3">
          <label className="block text-[12.5px] font-semibold">Pega aquí la tabla de vuelos</label>
          <p className="text-[12px] text-[color:var(--muted)]">En el portal, selecciona toda la tabla (de «Vuelo» hasta la última fila), copia (Ctrl+C) y pega aquí (Ctrl+V).</p>
          <textarea
            className="crm-field mt-1 block w-full"
            rows={5}
            autoFocus
            placeholder="Pega la tabla de vuelos…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const html = e.clipboardData.getData("text/html");
              const fromTable = html ? htmlTableToText(html) : null;
              if (fromTable) { e.preventDefault(); setText(fromTable); }
            }}
          />
          {parsed && parsed.warnings.map((w, i) => <p key={i} className="mt-1 text-[13px] text-[color:var(--risk)]">{w}</p>)}
          {parsed && parsed.flights.length > 0 && (
            <div className="mt-2">
              <p className="text-[13px] font-semibold">Encontré {parsed.flights.length} vuelo{parsed.flights.length === 1 ? "" : "s"}. Revísalos:</p>
              <ul className="mt-1 text-[12.5px]">
                {parsed.flights.map((f, i) => (
                  <li key={i} className="border-b border-[var(--border)] py-1">
                    <b>{f.flightNo || "s/n"}</b> · {f.fromCity} ({f.fromCode}) {f.departDate} {f.departTime} → {f.toCity} ({f.toCode}) {f.arriveDate} {f.arriveTime}
                    <span className="text-[color:var(--muted)]"> · {f.duration}{f.cabin ? ` · ${f.cabin}` : ""}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px]">
                <label className="flex items-center gap-1.5">Año del primer vuelo
                  <input className="crm-field" style={{ width: 90 }} inputMode="numeric" placeholder={parsed.flights[0].departDate.slice(0, 4)} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} />
                </label>
                <label className="flex items-center gap-1.5">Aerolínea (todos)
                  <input className="crm-field" style={{ width: 180 }} list="aerolineas" placeholder="Ej: LATAM" value={airline} onChange={(e) => setAirline(e.target.value)} />
                </label>
              </div>
              <p className="mt-1 text-[12px] text-[color:var(--muted)]">El equipaje no se puede copiar: lo marcas después, vuelo por vuelo.</p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" className="crm-btn" onClick={close}>Cancelar</button>
            {parsed && parsed.flights.length > 0 && <button type="button" className="crm-btn primary" onClick={accept}>{flights.length > 0 ? "Reemplazar los vuelos" : "Usar estos vuelos"}</button>}
          </div>
        </div>
      )}

      <datalist id="aerolineas">{AIRLINES.map((a) => <option key={a} value={a} />)}</datalist>
      {flights.length === 0 && !editable && <p className="text-[12.5px] text-[color:var(--muted)]">Esta versión no tiene vuelos en tabla.</p>}
      {flights.map((f, i) => (
        <div key={i} className="mb-2 rounded-lg border border-[var(--border)] p-2 text-[12.5px]">
          <div className="grid gap-2 md:grid-cols-[1.2fr_90px_1.4fr_70px_120px_90px]">
            <input className={inp} list="aerolineas" placeholder="Aerolínea" disabled={!editable} value={f.airline} onChange={(e) => patch(i, { airline: e.target.value })} />
            <input className={inp} placeholder="N° vuelo" disabled={!editable} value={f.flightNo} onChange={(e) => patch(i, { flightNo: e.target.value })} />
            <input className={inp} placeholder="Ciudad de salida" disabled={!editable} value={f.fromCity} onChange={(e) => patch(i, { fromCity: e.target.value })} />
            <input className={inp} placeholder="Cód." maxLength={3} disabled={!editable} value={f.fromCode} onChange={(e) => patch(i, { fromCode: e.target.value.toUpperCase() })} />
            <input className={inp} type="date" disabled={!editable} value={f.departDate} onChange={(e) => patch(i, { departDate: e.target.value })} />
            <input className={inp} type="time" disabled={!editable} value={f.departTime} onChange={(e) => patch(i, { departTime: e.target.value })} />
          </div>
          <div className="mt-1 grid gap-2 md:grid-cols-[1.2fr_90px_1.4fr_70px_120px_90px]">
            <span className="self-center text-[color:var(--muted)]">Llegada →</span>
            <span />
            <input className={inp} placeholder="Ciudad de llegada" disabled={!editable} value={f.toCity} onChange={(e) => patch(i, { toCity: e.target.value })} />
            <input className={inp} placeholder="Cód." maxLength={3} disabled={!editable} value={f.toCode} onChange={(e) => patch(i, { toCode: e.target.value.toUpperCase() })} />
            <input className={inp} type="date" disabled={!editable} value={f.arriveDate} onChange={(e) => patch(i, { arriveDate: e.target.value })} />
            <input className={inp} type="time" disabled={!editable} value={f.arriveTime} onChange={(e) => patch(i, { arriveTime: e.target.value })} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <input className="crm-field" style={{ width: 90 }} placeholder="Duración" disabled={!editable} value={f.duration} onChange={(e) => patch(i, { duration: e.target.value })} />
            <input className="crm-field" style={{ width: 80 }} placeholder="Paradas" disabled={!editable} value={f.stops} onChange={(e) => patch(i, { stops: e.target.value })} />
            <input className="crm-field" style={{ width: 150 }} placeholder="Clase / familia" disabled={!editable} value={f.cabin} onChange={(e) => patch(i, { cabin: e.target.value })} />
            <label className="flex items-center gap-1"><input type="checkbox" disabled={!editable} checked={f.baggage.hand} onChange={(e) => patch(i, { baggage: { ...f.baggage, hand: e.target.checked } })} /> Bolso de mano</label>
            <label className="flex items-center gap-1"><input type="checkbox" disabled={!editable} checked={f.baggage.cabin} onChange={(e) => patch(i, { baggage: { ...f.baggage, cabin: e.target.checked } })} /> Equipaje de cabina</label>
            <label className="flex items-center gap-1"><input type="checkbox" disabled={!editable} checked={f.baggage.hold} onChange={(e) => patch(i, { baggage: { ...f.baggage, hold: e.target.checked } })} /> Equipaje de bodega</label>
            {f.baggage.hold && <input className="crm-field" style={{ width: 90 }} placeholder="Ej: 23 kg" disabled={!editable} value={f.holdKg} onChange={(e) => patch(i, { holdKg: e.target.value })} />}
            {editable && <button type="button" className="crm-btn ml-auto" aria-label="Quitar vuelo" onClick={() => onChange(flights.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
          </div>
        </div>
      ))}
    </div>
  );
}
