// Revisión de una cotización antes de enviarla. No bloquea: avisa lo que falta o se ve raro.
import type { QuotationVersion } from "@/lib/types";

export type Aviso = { level: "importante" | "aviso"; text: string };

const DEFAULT_INCLUDES = "Asesoría personalizada antes y durante el viaje";
const PLACEHOLDER = /ciudad\s+de\s+origen|\[por confirmar\]/i;

export function revisarCotizacion(v: QuotationVersion, total: number, today = new Date().toISOString().slice(0, 10), dolarSistema: number | null = null): Aviso[] {
  const out: Aviso[] = [];
  const flights = v.flights ?? [];
  const add = (level: Aviso["level"], text: string) => out.push({ level, text });

  if (!v.title.trim()) add("importante", "La cotización no tiene título.");
  if (total <= 0) add("importante", "El total es $0: falta ingresar los montos.");
  else if (v.lines.some((l) => !(Number(l.amountClp) > 0))) add("aviso", "Hay líneas de detalle sin monto.");
  if (v.lines.some((l) => !l.title.trim())) add("aviso", "Hay líneas de detalle sin nombre.");
  const subtotal = v.lines.reduce((a, l) => a + (Number(l.amountClp) || 0), 0);
  if ((Number(v.discountClp) || 0) > subtotal) add("importante", "El descuento es mayor que el subtotal.");
  else if ((Number(v.discountClp) || 0) > 0 && !(v.discountLabel ?? "").trim()) add("aviso", "Hay un descuento sin motivo escrito.");

  if (v.fxManualRate != null && dolarSistema && Math.abs(v.fxManualRate - dolarSistema) / dolarSistema > 0.05)
    add("aviso", `El dólar manual ($${v.fxManualRate}) difiere más de 5% del dólar del sistema ($${dolarSistema}). Confírmalo.`);
  if (!v.validUntil) add("aviso", "No tiene fecha de vigencia.");
  else if (v.validUntil < today) add("importante", "La vigencia ya venció: actualiza la fecha.");

  if (v.itinerary.length === 0) add("aviso", "No tiene itinerario día por día.");
  const sinDetalle = v.itinerary.filter((d) => !d.detail.trim()).length;
  if (sinDetalle > 0) add("aviso", `${sinDetalle} día${sinDetalle === 1 ? "" : "s"} del itinerario sin descripción.`);
  if (flights.length === 0 && !(v.flightsText ?? "").trim()) add("aviso", "No tiene vuelos cargados.");
  const vSinEquipaje = flights.filter((f) => !f.baggage.hand && !f.baggage.cabin && !f.baggage.hold).length;
  if (vSinEquipaje > 0) add("aviso", `${vSinEquipaje} vuelo${vSinEquipaje === 1 ? "" : "s"} sin equipaje marcado.`);
  if (flights.some((f) => !f.airline.trim())) add("aviso", "Hay vuelos sin aerolínea.");

  const incluye = (v.includesText ?? "").trim();
  if (!incluye || incluye === DEFAULT_INCLUDES) add("aviso", "«Incluye» está vacío o con el texto por defecto.");

  const textos = [v.title, v.subtitle ?? "", v.flightsText ?? "", ...flights.flatMap((f) => [f.fromCity, f.toCity, f.airline]), v.includesText ?? "", v.excludesText ?? "", ...v.itinerary.flatMap((d) => [d.title, d.detail])];
  if (textos.some((t) => PLACEHOLDER.test(t))) add("importante", "Quedó un marcador sin reemplazar («CIUDAD DE ORIGEN» o «[POR CONFIRMAR]»).");
  return out;
}
