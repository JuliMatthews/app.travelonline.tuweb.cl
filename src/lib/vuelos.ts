// Lector de la tabla de vuelos que se copia desde el portal de la aerolínea (Vuelo · Salida · Llegada · Duración · Avión ·
// Paradas · Asientos · Surface · Familia/Clases · Equipaje). Asientos, Surface y Avión no se guardan: no le sirven al pasajero.
// El equipaje viene como íconos (no se puede copiar): se marca a mano después.
export type Flight = {
  airline: string;
  flightNo: string;
  fromCity: string;
  fromCode: string;
  departDate: string; // YYYY-MM-DD
  departTime: string; // HH:MM
  toCity: string;
  toCode: string;
  arriveDate: string;
  arriveTime: string;
  duration: string;
  stops: string;
  cabin: string;
  baggage: { hand: boolean; cabin: boolean; hold: boolean };
  holdKg: string;
};

export const AIRLINES = [
  "LATAM", "Sky Airline", "JetSMART", "Aerolíneas Argentinas", "Avianca", "Copa Airlines", "Iberia", "Air France", "KLM", "Lufthansa",
  "British Airways", "Air Europa", "TAP Air Portugal", "Turkish Airlines", "Emirates", "Qatar Airways", "American Airlines", "Delta", "United",
];

const MONTHS: Record<string, number> = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
const L = "A-Za-zÁÉÍÓÚÑáéíóúñü";
// «Santiago de Chile  SCL  Dom, 03 Ene  16:00»  →  ciudad, código, (día de la semana), día, mes, hora
const CELL = new RegExp(`([${L}][${L} .'’-]*?)\\s*[\\t\\n ]\\s*([A-Z]{3})\\s*[\\t\\n ]\\s*(?:[${L}]{3,9}\\.?,?\\s*)?(\\d{1,2})\\s+([${L}]{3,10})\\.?\\s*[\\t\\n ]\\s*(\\d{1,2}:\\d{2})`, "g");

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const time = (t: string) => (t.length === 4 ? "0" + t : t);

/** Convierte lo pegado como HTML (tabla copiada de una página) en texto con tabulaciones por celda y salto de línea por fila. */
export function htmlTableToText(html: string): string | null {
  if (!/<table/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = Array.from(doc.querySelectorAll("tr"));
  if (rows.length === 0) return null;
  // textContent ignora los <br> y los bloques (div, p…): sin esto «Santiago de Chile<br>SCL<br>Vie, 12 Mar» queda pegado.
  doc.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
  doc.querySelectorAll("div,p,li,span,b,strong,small").forEach((e) => e.append(" "));
  return rows
    .map((tr) => Array.from(tr.querySelectorAll("th,td")).map((c) => (c.textContent ?? "").replace(/[ \t\u00a0]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n+/g, "\n").trim()).join("\t"))
    .join("\n");
}

const SURFACE = /^(SI|SÍ|NO)$/;

/** Cola de la fila: [avión, (paradas), asientos, surface, clase…, texto de equipaje, «remover»].
 *  - Paradas: si la columna viene en blanco (vuelo directo) quedan solo los asientos antes del «surface»: paradas = 0.
 *  - El botón «remover» del portal se descarta.
 *  - El equipaje, cuando el portal lo trae escrito («Incluye cartera de mano… No incluye equipaje para despachar»), se marca solo. */
export function parseTail(rest: string[]) {
  const baggage = { hand: false, cabin: false, hold: false };
  let holdKg = "";
  let stops = "";
  let raw: string;
  const sIdx = rest.findIndex((t, i) => i >= 1 && SURFACE.test(t));
  if (sIdx >= 1) {
    const nums = rest.slice(1, sIdx).filter((t) => /^\d+$/.test(t));
    stops = nums.length >= 2 ? nums[0] : "0";
    raw = rest.slice(sIdx + 1).join(" ");
  } else {
    stops = /^\d$/.test(rest[1] ?? "") ? rest[1] : "";
    raw = rest.slice(4).join(" ");
  }
  raw = raw.replace(/\bremover\b/gi, " ").replace(/\s+/g, " ").trim();
  const m = raw.search(/\b(?:No incluye|Incluye)\b/);
  const cabin = (m >= 0 ? raw.slice(0, m) : raw).trim();
  const bagText = m >= 0 ? raw.slice(m) : "";
  for (const clause of bagText.split(/(?=\b(?:No incluye|Incluye)\b)/).map((c) => c.trim()).filter(Boolean)) {
    const included = /^Incluye/.test(clause);
    const low = clause.toLowerCase();
    if (/mano|cartera|bolso/.test(low)) baggage.hand = included;
    else if (/cabina/.test(low)) baggage.cabin = included;
    else if (/despach|bodega|facturad|check/.test(low)) {
      baggage.hold = included;
      const kg = low.match(/(\d{1,3})\s?kg/);
      if (included && kg) holdKg = `${kg[1]} kg`;
    }
  }
  return { stops, cabin, baggage, holdKg };
}

export type ParseFlightsResult = { flights: Flight[]; warnings: string[] };

/** `today` y `yearOverride` permiten fijar el año (la tabla trae «03 Ene» sin año). */
function parseFlightsCore(text: string, opts: { today?: Date; yearOverride?: number | null } = {}): ParseFlightsResult {
  const warnings: string[] = [];
  const matches = Array.from(text.matchAll(CELL));
  if (matches.length < 2) return { flights: [], warnings: ["No encontré vuelos. Copia la tabla completa del portal (con las columnas Salida y Llegada) y pégala de nuevo."] };
  if (matches.length % 2 === 1) warnings.push("Encontré una celda de salida o llegada sin su pareja; revisa los vuelos.");

  const today = opts.today ?? new Date();
  const flights: Flight[] = [];
  let prev: Date | null = null; // última fecha usada, para resolver el año de los vuelos siguientes
  let prevEnd = 0;
  for (let i = 0; i + 1 < matches.length; i += 2) {
    const dep = matches[i];
    const arr = matches[i + 1];
    const before = text.slice(prevEnd, dep.index ?? 0);
    const flightNo = (before.match(/\b(\d{2,4})\b(?!.*\b\d{2,4}\b)/s)?.[1] ?? "").trim();
    const nextStart = i + 2 < matches.length ? (matches[i + 2].index ?? text.length) : text.length;
    const afterRaw = text.slice((arr.index ?? 0) + arr[0].length, nextStart);
    // la cola termina donde empieza el número de vuelo del siguiente registro
    const after = i + 2 < matches.length ? afterRaw.replace(/\s*\b\d{2,4}\b\s*$/, " ") : afterRaw;
    prevEnd = (arr.index ?? 0) + arr[0].length;

    const mon = (m: RegExpMatchArray) => MONTHS[m[4].toLowerCase().slice(0, 3)] ?? 0;
    const dm = mon(dep), am = mon(arr);
    if (!dm || !am) warnings.push(`No reconocí el mes en el vuelo ${flightNo || i / 2 + 1}.`);
    let dy: number;
    if (opts.yearOverride && !prev) dy = opts.yearOverride;
    else if (prev) { dy = prev.getFullYear(); if (new Date(dy, dm - 1, +dep[3]) < prev) dy += 1; }
    else { dy = today.getFullYear(); if (new Date(dy, dm - 1, +dep[3]) < new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)) dy += 1; }
    let ay = dy;
    if (new Date(ay, am - 1, +arr[3]) < new Date(dy, dm - 1, +dep[3])) ay += 1;
    prev = new Date(ay, am - 1, +arr[3]);

    const dur = after.match(/(\d{1,2})\s*h\s*:?\s*(\d{1,2})?\s*m?/i);
    const duration = dur ? `${dur[1]}h ${dur[2] ?? "00"}m` : "";
    // resto tras la duración: avión, (paradas), asientos, surface, familia/clases, equipaje (texto)
    const rest = dur ? after.slice((dur.index ?? 0) + dur[0].length).trim().split(/[\t\n ]+/).filter(Boolean) : [];
    const tail = parseTail(rest);
    flights.push({
      airline: "",
      flightNo,
      fromCity: dep[1].trim(), fromCode: dep[2], departDate: dm ? iso(dy, dm, +dep[3]) : "", departTime: time(dep[5]),
      toCity: arr[1].trim(), toCode: arr[2], arriveDate: am ? iso(ay, am, +arr[3]) : "", arriveTime: time(arr[5]),
      duration, stops: tail.stops, cabin: tail.cabin,
      baggage: tail.baggage, holdKg: tail.holdKg,
    });
  }
  return { flights, warnings };
}

/** Algunos portales/navegadores entregan la tabla con las celdas pegadas, sin tabulaciones ni saltos
 *  («Santiago de ChileSCLVie, 12 Mar11:45Estambul…»). Vuelve a separar las celdas por sus límites conocidos. */
export function desglosar(text: string): string {
  const U = "A-ZÁÉÍÓÚÑ";
  const l = "a-záéíóúñü";
  return text
    .replace(/\bremover\b|(?<=[a-z])remover/gi, "\n")
    .replace(new RegExp(`([${l}.])([A-Z]{3})(?=[${U}][${l}]{2},)`, "g"), "$1\t$2") // ciudad|código
    .replace(new RegExp(`([A-Z]{3})(?=[${U}][${l}]{2},)`, "g"), "$1\t") // código|día
    .replace(/(\d{1,2}\s+[A-Za-zñÑ]{3}\.?)(\d{1,2}:\d{2})/g, "$1\t$2") // fecha|hora
    .replace(new RegExp(`(\\d{1,2}:\\d{2})(?=[${U}][${l}])`, "g"), "$1\t") // hora|ciudad de llegada
    .replace(/(\d{1,2}:\d{2})(?=\d{1,2}h)/g, "$1\t") // hora|duración
    .replace(/(\d{1,2}h\s*:?\s*\d{1,2}\s*m)\s*([0-9A-Z]{3})\s*(\d*)\s*(\+\d)?\s*(\d)\s*(SI|SÍ|NO)/g,
      (_m, d, av, st, plus, seats, sur) => `${d}\t${av}\t${st ? st + "\t" : ""}${plus ? plus + "\t" : ""}${seats}\t${sur}\t`) // duración|avión|paradas|asientos|surface
    .replace(new RegExp(`(\\t[${U}]{2})(?=[${U}][${l}])`, "g"), "$1\t") // familia|clase
    .replace(new RegExp(`([${l}])(?=Incluye|No incluye)`, "g"), "$1\t")
    .replace(new RegExp(`([${l}])\\s*(?=\\d{2,4}[${U}][${l}])`, "g"), "$1\n"); // fin de fila|nº de vuelo
}

/** Lee la tabla; si no encuentra vuelos, reintenta separando las celdas pegadas. */
export function parseFlights(text: string, opts: { today?: Date; yearOverride?: number | null } = {}): ParseFlightsResult {
  const r = parseFlightsCore(text, opts);
  if (r.flights.length > 0) return r;
  const r2 = parseFlightsCore(desglosar(text), opts);
  return r2.flights.length > 0 ? r2 : r;
}

export const emptyFlight = (): Flight => ({
  airline: "", flightNo: "", fromCity: "", fromCode: "", departDate: "", departTime: "", toCity: "", toCode: "", arriveDate: "", arriveTime: "",
  duration: "", stops: "", cabin: "", baggage: { hand: false, cabin: false, hold: false }, holdKg: "",
});

/** «03 ene 2027» a partir de YYYY-MM-DD, sin depender de la zona horaria. */
export function fechaCorta(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  const names = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${m[3]} ${names[+m[2] - 1]} ${m[1]}`;
}

export function equipajeTexto(f: Flight): string {
  const out: string[] = [];
  if (f.baggage.hand) out.push("Bolso de mano");
  if (f.baggage.cabin) out.push("Equipaje de cabina");
  if (f.baggage.hold) out.push(f.holdKg.trim() ? `Equipaje de bodega (${f.holdKg.trim()})` : "Equipaje de bodega");
  else if (f.baggage.hand || f.baggage.cabin) out.push("Sin equipaje de bodega");
  return out.join(" · ");
}
