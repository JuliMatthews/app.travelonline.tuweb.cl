// Catálogos y formatos del CRM — mismos estados, canales y formato chileno
// que el CRM de Francisco (03-reglas-de-negocio.md, sección 10).
import type { QuoteAlert, QuoteChannel, QuoteStatus } from "@/lib/types";

export const STATUS_ORDER: QuoteStatus[] = [
  "nueva",
  "cotizacion_enviada",
  "en_seguimiento",
  "respondido",
  "venta_cerrada",
  "no_interesado",
];

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  nueva: "Nueva",
  cotizacion_enviada: "Cotización enviada",
  en_seguimiento: "En seguimiento",
  respondido: "Respondido",
  venta_cerrada: "Venta cerrada",
  no_interesado: "No interesado",
};

export const STATUS_HELP: Record<QuoteStatus, string> = {
  nueva: "Recibida, pendiente de revisión",
  cotizacion_enviada: "Cotización enviada al pasajero",
  en_seguimiento: "A la espera de respuesta del pasajero",
  respondido: "El pasajero respondió, en negociación",
  venta_cerrada: "Venta confirmada",
  no_interesado: "Descartada · candidata a reactivación",
};

export const CHANNEL_ORDER: QuoteChannel[] = ["web", "whatsapp", "telefono", "instagram", "correo", "referido", "otro"];

export const CHANNEL_LABEL: Record<QuoteChannel, string> = {
  web: "Sitio web",
  telefono: "Teléfono",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  correo: "Correo",
  referido: "Recomendación",
  otro: "Otro",
};

export const REQUEST_TYPE_LABEL: Record<string, string> = {
  paquete: "Paquete",
  a_medida: "Viaje a medida",
  reunion: "Reunión",
  problema: "Problema con un viaje",
};

export const ALERT_LABEL: Record<QuoteAlert, string> = {
  urgente: "Urgente · 5+ días sin contacto",
  atencion: "Atención · 3+ días sin contacto",
  aldia: "Al día",
  cerrado: "Cerrada",
};

export const statusVar = (s: string) => `var(--st-${s})`;
export const channelVar = (c: string) => `var(--ch-${c})`;

const clpFmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

/** $1.234.567 — punto como separador de miles, sin decimales. */
export function clp(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + clpFmt.format(Math.round(n));
}

/** $277,2 M · $831 mil · $950 — para tarjetas y paneles compactos. */
export function clpShort(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 }) + " M";
  if (Math.abs(n) >= 1_000) return "$" + Math.round(n / 1_000).toLocaleString("es-CL") + " mil";
  return clp(n);
}

/** 25,0% — coma decimal. */
export function pct(n: number): string {
  return n.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

// Las fechas vienen de MySQL en UTC ("2026-10-09 01:23:03").
function parseDb(d: string): Date {
  return new Date(d.includes("T") ? d : d.replace(" ", "T") + "Z");
}

/** 15-08-2026 */
export function fecha(d: string | null | undefined): string {
  if (!d) return "—";
  const x = parseDb(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(x.getDate())}-${p(x.getMonth() + 1)}-${x.getFullYear()}`;
}

/** 15 de agosto de 2026 */
export function fechaLarga(d: string | null | undefined): string {
  if (!d) return "—";
  return parseDb(d).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
}

/** 15-08-2026 14:32 */
export function fechaHora(d: string | null | undefined): string {
  if (!d) return "—";
  const x = parseDb(d);
  return fecha(d) + " " + x.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

export function haceDias(n: number): string {
  if (n <= 0) return "hoy";
  if (n === 1) return "ayer";
  return `hace ${n} días`;
}

export function pax(adults: number, children: number): string {
  return `${adults} adulto${adults === 1 ? "" : "s"}` + (children ? ` + ${children} niño${children === 1 ? "" : "s"}` : "");
}
