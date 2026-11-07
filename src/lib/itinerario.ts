// Lector de itinerarios pegados: separa un texto largo en días.
// Reconoce encabezados como "lunes, 4 de enero de 2027: MADRID - PARÍS (AD)" (con o sin año)
// y, como alternativa, "Día 3: ..." / "Día 3 · ...". Todo lo que sigue a un encabezado, hasta el próximo, es el detalle de ese día.
export type ParsedDay = { title: string; detail: string };
export type ParseResult = { days: ParsedDay[]; ignoredBefore: string; usedFallback: boolean };

const WEEKDAY = "(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)";
const MONTH = "(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)";
const DATE_HEADER = new RegExp(`^\\s*${WEEKDAY}\\s*,?\\s*\\d{1,2}\\s+de\\s+${MONTH}(?:\\s+de\\s+\\d{4})?\\s*[:\\-–—·]\\s*\\S.*$`, "i");
const DAY_HEADER = /^\s*d[ií]a\s+\d{1,3}\s*[:\-–—·.]\s*\S.*$/i;

export const MAX_TITLE = 190;
export const MAX_DETAIL = 20000;

/** Quita marcas de Markdown (**negrita**, __, # títulos, viñetas al inicio de línea) que vienen al copiar desde un chat. */
function clean(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-•]\s+/gm, "");
}

export function parseItinerary(raw: string): ParseResult {
  const lines = clean(raw).split("\n");
  const run = (isHeader: (l: string) => boolean): ParseResult => {
    const days: ParsedDay[] = [];
    let before: string[] = [];
    let cur: { title: string; body: string[] } | null = null;
    const flush = () => {
      if (!cur) return;
      // párrafos separados por una línea en blanco; las líneas en blanco sobrantes se descartan
      const detail = cur.body.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      days.push({ title: cur.title.trim().slice(0, MAX_TITLE), detail: detail.slice(0, MAX_DETAIL) });
    };
    for (const line of lines) {
      if (isHeader(line)) {
        flush();
        cur = { title: line.trim().replace(/\s+/g, " "), body: [] };
      } else if (cur) cur.body.push(line.trimEnd());
      else before.push(line);
    }
    flush();
    return { days, ignoredBefore: before.join("\n").trim(), usedFallback: false };
  };

  const byDate = run((l) => DATE_HEADER.test(l));
  if (byDate.days.length > 0) return byDate;
  const byDay = run((l) => DAY_HEADER.test(l));
  return { ...byDay, usedFallback: true };
}

/** Reemplaza el marcador "CIUDAD DE ORIGEN" por la ciudad real. */
export function replaceOrigin(days: ParsedDay[], city: string): ParsedDay[] {
  const c = city.trim();
  if (!c) return days;
  const re = /ciudad\s+de\s+origen/gi;
  return days.map((d) => ({ title: d.title.replace(re, c.toUpperCase()), detail: d.detail.replace(re, c) }));
}

export const hasOriginPlaceholder = (days: ParsedDay[]) => days.some((d) => /ciudad\s+de\s+origen/i.test(d.title + " " + d.detail));
