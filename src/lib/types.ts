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

export type QuoteStatus = "nueva" | "en_proceso" | "ganada" | "perdida";

export type QuoteSummary = {
  id: number;
  createdAt: string;
  packageSlug: string;
  packageTitle: string;
  passengerName: string;
  passengerEmail: string;
  totalClp: number | null;
  status: QuoteStatus;
  assignedToName: string | null;
};

export type QuoteDetail = QuoteSummary & {
  adults: number;
  children: number;
  roomOptionLabel: string | null;
  selectedAddons: { id: string; name: string; priceClp: number }[];
  perPersonBaseClp: number | null;
  passengersSubtotalClp: number | null;
  addonsTotalClp: number;
  roomAdjustmentClp: number;
  depositSuggestedClp: number | null;
  preferredDateFrom: string | null;
  preferredDateTo: string | null;
  passengerPhone: string;
  comments: string | null;
  internalNotes: string | null;
  assignedTo: string | null;
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
