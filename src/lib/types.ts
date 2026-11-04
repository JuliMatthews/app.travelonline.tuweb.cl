// Tipos compartidos entre `web` y `admin`. Se va ampliando fase por fase del
// plan de migración (ver ~/.claude/plans/luminous-prancing-lampson.md).

export type Role = "super_admin" | "admin_viewer" | "editor" | "operaciones" | "reportes";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
};

export type PackageType = "circuito" | "todo_incluido" | "combinado" | "promocion_2x1";
export type PriceDisplayMode = "desde" | "bajo_consulta" | "rango";
export type PriceUnit = "per_person" | "per_couple";
export type PackageStatus = "draft" | "published" | "archived";

export type PackageAddon = {
  id: string;
  name: string;
  priceClp: number;
  sortOrder: number;
};

export type PackageRoomOption = {
  id: string;
  label: string;
  priceAdjustmentClp: number;
  sortOrder: number;
};

export type PackageItineraryDay = {
  id: string;
  dayNumber: number | null;
  title: string;
  description: string;
  sortOrder: number;
};

export type PackageImage = {
  id: string;
  extension: string;
  altText: string | null;
  sortOrder: number;
};

export type Region = {
  id: string;
  slug: string;
  name: string;
};

// Fila plana de `packages` — usada por el listado del panel.
export type PackageSummary = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  packageType: PackageType;
  region: Region | null;
  status: PackageStatus;
  priceDisplayMode: PriceDisplayMode;
  priceFromClp: number | null;
  isFeatured: boolean;
  showInPromociones: boolean;
  updatedAt: string;
  /** Datos que le faltan al paquete (solo viene en la lista): descripcion, precio, dias, incluye, no_incluye, itinerario. */
  gaps?: string[];
  /** Solicitudes de cotización de los últimos 30 días que mencionan este programa (solo viene en la lista). */
  quotes30?: number;
  operatorId?: number | null;
  operatorName?: string | null;
  /** Precio original del proveedor en dólares (CLP = USD × (1 + margen) × tipo de cambio). */
  priceUsd?: number | null;
  tariffValidUntil?: string | null;
  tariffExpired?: boolean;
  /** Regla de salidas tal como la dice el proveedor ("Todos los sábados"). */
  departuresText?: string | null;
  nextDeparture?: string | null;
  futureDepartures?: number;
};

export type PackageDeparture = { id?: number; departsOn: string; tier: string | null; priceUsd: number | null; seats: number | null; note: string | null };

export type PackageDetail = PackageSummary & {
  content: string | null;
  durationDays: number | null;
  durationNights: number | null;
  priceToClp: number | null;
  priceUnit: PriceUnit;
  included: string | null;
  notIncluded: string | null;
  internalNotes: string | null;
  featuredSortOrder: number | null;
  addons: PackageAddon[];
  roomOptions: PackageRoomOption[];
  itinerary: PackageItineraryDay[];
  images: PackageImage[];
  departures: PackageDeparture[];
};

// Payload que manda el formulario del panel al crear/editar un paquete —
// los hijos (addons/roomOptions/itinerary) van completos, se reemplazan
// enteros en cada guardado (más simple que diffear fila por fila).
export type PackageInput = {
  slug: string;
  title: string;
  subtitle: string;
  content: string;
  durationDays: number | null;
  durationNights: number | null;
  packageType: PackageType;
  priceDisplayMode: PriceDisplayMode;
  priceFromClp: number | null;
  priceToClp: number | null;
  priceUnit: PriceUnit;
  included: string;
  notIncluded: string;
  internalNotes: string;
  regionId: string | null;
  isFeatured: boolean;
  featuredSortOrder: number | null;
  showInPromociones: boolean;
  status: PackageStatus;
  addons: { name: string; priceClp: number }[];
  roomOptions: { label: string; priceAdjustmentClp: number }[];
  itinerary: { dayNumber: number | null; title: string; description: string }[];
  imageIds: string[]; // orden = el orden final de la galería
  operatorId: number | null;
  priceUsd: number | null;
  tariffValidUntil: string | null;
  departuresText: string;
  departures: { departsOn: string; tier: string; priceUsd: number | null; seats: number | null; note: string }[];
};

export type QuoteStatus =
  | "nueva"
  | "cotizacion_enviada"
  | "en_seguimiento"
  | "respondido"
  | "venta_cerrada"
  | "no_interesado";

export type QuoteBrand = "travel_online" | "travel_viajes";
export type QuoteChannel = "web" | "telefono" | "whatsapp" | "asistente" | "instagram" | "correo" | "referido" | "otro";
export type QuoteAlert = "urgente" | "atencion" | "aldia" | "cerrado";

export type QuoteSummary = {
  id: number;
  folio: string | null;
  requestType: "paquete" | "a_medida" | "reunion" | "problema";
  channel: QuoteChannel;
  brand: QuoteBrand;
  createdAt: string;
  packageSlug: string | null;
  packageTitle: string | null;
  destination: string | null;
  originCity: string | null;
  travelType: string | null;
  adults: number;
  children: number;
  passengerName: string;
  passengerEmail: string | null;
  passengerPhone: string;
  totalClp: number | null;
  budgetClp: number | null;
  budgetRange: string | null;
  saleAmountClp: number | null;
  status: QuoteStatus;
  assignedTo: string | null;
  assignedToName: string | null;
  lastContactAt: string | null;
  daysSinceContact: number;
  hoursSinceContact: number;
  alert: QuoteAlert;
  quoteDue: string | null;
  quoteOverdue: boolean;
  /** Rescatada del correo info@travelviajes.cl (reenvío caído jun-nov 2026). */
  recovered: boolean;
  /** Alguien ya registró un contacto o movió el estado (solo tiene sentido en las rescatadas). */
  attended: boolean;
};

/** Lo que el cliente pidió por correo, guardado al rescatarlo. */
export type RecoveredMessage = {
  fecha: string;
  origen: string;
  asunto: string;
  destino: string;
  fechasViaje: string;
  pax: string;
  presupuesto: string;
  texto: string;
};
export type Recovery = {
  categoria: "Nuevo lead" | "Posventa";
  origen: string;
  primerMensaje: string;
  ultimoMensaje: string;
  mensajes: RecoveredMessage[];
};

export type QuoteActivity = {
  id: number;
  kind: "nota" | "estado" | "asignacion" | "sistema" | "mensaje";
  body: string;
  createdAt: string;
  authorName: string | null;
  toUserId: string | null;
  toName: string | null;
  readAt: string | null;
  versionId: number | null;
};

export type QuoteDetail = QuoteSummary & {
  referredByEmail: string | null;
  loyalty: Loyalty;
  operatorId: number | null;
  roomOptionLabel: string | null;
  selectedAddons: { id: string; name: string; priceClp: number }[];
  perPersonBaseClp: number | null;
  passengersSubtotalClp: number | null;
  addonsTotalClp: number;
  roomAdjustmentClp: number;
  depositSuggestedClp: number | null;
  preferredDateFrom: string | null;
  preferredDateTo: string | null;
  comments: string | null;
  internalNotes: string | null;
  quotedAt: string | null;
  closedAt: string | null;
  details: Record<string, unknown>;
  recovery: Recovery | null;
  activity: QuoteActivity[];
};

export type GroupCount = { key: string; count: number };

export type AlertCfg = { warnHours: number; urgentHours: number };

export type QuoteStats = {
  alert: AlertCfg;
  total: number;
  quoted: number;
  responded: number;
  sales: number;
  followUp: number;
  active: number;
  urgent: number;
  warning: number;
  revenue: number;
  potential: number;
  avgResponseDays: number | null;
  conversion: number;
  conversionQuoted: number;
  avgTicket: number;
  month: { received: number; quoted: number; sales: number; sold: number; soldPrev: number; goal: number; day: number; daysInMonth: number };
  byStatus: GroupCount[];
  byChannel: GroupCount[];
  byOwner: GroupCount[];
  byTravelType: GroupCount[];
  topDestinations: { destination: string; count: number; sales: number }[];
};

export type StaticPage = {
  id: string;
  slug: string;
  title: string;
  content: string;
  updatedAt: string;
};

export type BlogStatus = "draft" | "published";

export type BlogPostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  status: BlogStatus;
  publishedAt: string | null;
  featuredImage: PackageImage | null;
};

export type BlogPostDetail = BlogPostSummary & {
  content: string;
};

export type BlogPostInput = {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  status: BlogStatus;
  publishedAt: string | null;
  featuredImageId: string | null;
};

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
};

export type ClientSummary = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /** registro | google | cotizacion_web | rescatado | manual */
  source: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  quotesCount: number;
  /** Tiene solicitudes rescatadas del correo info@travelviajes.cl. */
  recovered: boolean;
  /** ...y alguna sigue sin atender. */
  pending: boolean;
  /** ...y alguna es de posventa (devolución, anulación, cambio). */
  posventa: boolean;
  lastDestination: string | null;
  firstRequestAt: string | null;
};

export type ClientQuoteSummary = {
  id: number;
  createdAt: string;
  packageTitle: string;
  status: QuoteStatus;
  totalClp: number | null;
};

export type ClientDetail = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  source: string;
  emailVerified: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  internalNotes: string | null;
};

export type ItineraryDay = { title: string; detail: string };
export type QuotationLine = { title: string; detail: string; amountClp: number };

export type QuotationVersion = {
  id: number;
  version: number;
  label: string;
  status: "borrador" | "enviada";
  title: string;
  subtitle: string | null;
  pax: number;
  lines: QuotationLine[];
  discountClp: number;
  discountLabel: string | null;
  totalClp: number;
  includesText: string | null;
  excludesText: string | null;
  flightsText: string | null;
  itinerary: ItineraryDay[];
  validUntil: string | null;
  promisedAt: string | null;
  changeReason: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  createdByName: string | null;
};

export type Quotation = {
  id: number;
  requestId: number;
  number: number;
  versions: QuotationVersion[];
  packageId: string | null;
  packageStatus: "draft" | "published" | "archived" | null;
};

export type QuotationPrint = {
  reviewTo: string | null;
  version: QuotationVersion & { number: number };
  request: { folio: string | null; brand: QuoteBrand; passengerName: string; passengerEmail: string | null; passengerPhone: string };
};

export type Operator = {
  id: number;
  name: string;
  country: string;
  kind: string;
  destinations: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  commissionPct: number | null;
  /** Margen que Travel Online suma sobre la tarifa de este proveedor (solo lo ve quien ve comisiones). */
  markupPct: number | null;
};

export type ReportRow = {
  id: number;
  folio: string | null;
  brand: QuoteBrand;
  passengerName: string;
  destination: string | null;
  closedAt: string | null;
  saleClp: number;
  operatorId: number | null;
  operatorName: string | null;
  commissionPct: number | null;
  grossClp: number | null;
  executiveClp: number | null;
  managementClp: number | null;
  agencyClp: number | null;
  ownerId: string | null;
  ownerName: string | null;
};
export type ReportGroup = { name: string; sales: number; saleClp: number; grossClp: number; executiveClp: number; managementClp: number; agencyClp: number };
export type Report = {
  rows: ReportRow[];
  totals: { sales: number; saleClp: number; grossClp: number; executiveClp: number; managementClp: number; agencyClp: number; withoutOperator: number };
  byOperator: ReportGroup[];
  byOwner: ReportGroup[];
  split: { executive: number; management: number; agency: number };
  operators: { id: number; name: string }[];
  owners: { id: string; name: string }[];
  canEditSplit: boolean;
};

export type Loyalty = { purchases: number; requests: number; totalClp: number; referred: number };

export type Customer = {
  name: string;
  email: string | null;
  phone: string | null;
  requests: number;
  purchases: number;
  totalClp: number;
  firstAt: string;
  lastAt: string;
  brands: QuoteBrand[];
};
export type Referrer = { email: string; name: string | null; referred: number; sales: number; totalClp: number };
export type LoyaltyData = {
  customers: Customer[];
  summary: { customers: number; withPurchase: number; recurring: number };
  referrers: Referrer[];
};

export type ChannelHealth = {
  channel: QuoteChannel;
  total: number;
  lastAt: string | null;
  last7: number;
  last30: number;
  prev7: number;
  silentDays: number | null;
  alertDays: number;
  series: number[];
  silent: boolean;
  neverReceived: boolean;
};
