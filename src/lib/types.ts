// Tipos compartidos entre `web` y `admin`. Se va ampliando fase por fase del
// plan de migración (ver ~/.claude/plans/luminous-prancing-lampson.md).

export type Role = "super_admin" | "admin_viewer" | "editor";

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
};

export type PackageDetail = PackageSummary & {
  content: string | null;
  durationDays: number | null;
  durationNights: number | null;
  priceToClp: number | null;
  priceUnit: PriceUnit;
  included: string | null;
  notIncluded: string | null;
  featuredSortOrder: number | null;
  addons: PackageAddon[];
  roomOptions: PackageRoomOption[];
  itinerary: PackageItineraryDay[];
  images: PackageImage[];
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
  regionId: string | null;
  isFeatured: boolean;
  featuredSortOrder: number | null;
  showInPromociones: boolean;
  status: PackageStatus;
  addons: { name: string; priceClp: number }[];
  roomOptions: { label: string; priceAdjustmentClp: number }[];
  itinerary: { dayNumber: number | null; title: string; description: string }[];
  imageIds: string[]; // orden = el orden final de la galería
};

export type QuoteStatus =
  | "nueva"
  | "cotizacion_enviada"
  | "en_seguimiento"
  | "respondido"
  | "venta_cerrada"
  | "no_interesado";

export type QuoteChannel = "web" | "telefono" | "whatsapp" | "instagram" | "correo" | "referido" | "otro";
export type QuoteAlert = "urgente" | "atencion" | "aldia" | "cerrado";

export type QuoteSummary = {
  id: number;
  folio: string | null;
  requestType: "paquete" | "a_medida" | "reunion" | "problema";
  channel: QuoteChannel;
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
  alert: QuoteAlert;
};

export type QuoteActivity = {
  id: number;
  kind: "nota" | "estado" | "asignacion" | "sistema";
  body: string;
  createdAt: string;
  authorName: string | null;
};

export type QuoteDetail = QuoteSummary & {
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
  activity: QuoteActivity[];
};

export type GroupCount = { key: string; count: number };

export type QuoteStats = {
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
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  quotesCount: number;
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
  emailVerified: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  internalNotes: string | null;
};
