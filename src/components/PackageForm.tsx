import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost, apiUpload } from "@/lib/api";
import type { PackageDetail, PackageInput, Region } from "@/lib/types";

type ImageItem = { id: string; extension: string };

function emptyInput(): PackageInput {
  return {
    slug: "",
    title: "",
    subtitle: "",
    content: "",
    durationDays: null,
    durationNights: null,
    packageType: "circuito",
    priceDisplayMode: "bajo_consulta",
    priceFromClp: null,
    priceToClp: null,
    priceUnit: "per_person",
    included: "",
    notIncluded: "",
    internalNotes: "",
    regionId: null,
    isFeatured: false,
    featuredSortOrder: null,
    showInPromociones: false,
    status: "draft",
    addons: [],
    roomOptions: [],
    itinerary: [],
    imageIds: [],
    operatorId: null,
    priceUsd: null,
    tariffValidUntil: null,
    departuresText: "",
    departures: [],
  };
}

function fromDetail(pkg: PackageDetail): PackageInput {
  return {
    slug: pkg.slug,
    title: pkg.title,
    subtitle: pkg.subtitle ?? "",
    content: pkg.content ?? "",
    durationDays: pkg.durationDays,
    durationNights: pkg.durationNights,
    packageType: pkg.packageType,
    priceDisplayMode: pkg.priceDisplayMode,
    priceFromClp: pkg.priceFromClp,
    priceToClp: pkg.priceToClp,
    priceUnit: pkg.priceUnit,
    included: pkg.included ?? "",
    notIncluded: pkg.notIncluded ?? "",
    internalNotes: pkg.internalNotes ?? "",
    regionId: pkg.region?.id ?? null,
    isFeatured: pkg.isFeatured,
    featuredSortOrder: pkg.featuredSortOrder,
    showInPromociones: pkg.showInPromociones,
    status: pkg.status,
    addons: pkg.addons.map((a) => ({ name: a.name, priceClp: a.priceClp })),
    roomOptions: pkg.roomOptions.map((r) => ({
      label: r.label,
      priceAdjustmentClp: r.priceAdjustmentClp,
    })),
    itinerary: pkg.itinerary.map((d) => ({
      dayNumber: d.dayNumber,
      title: d.title,
      description: d.description,
    })),
    imageIds: pkg.images.map((i) => i.id),
    operatorId: pkg.operatorId ?? null,
    priceUsd: pkg.priceUsd ?? null,
    tariffValidUntil: pkg.tariffValidUntil ?? null,
    departuresText: pkg.departuresText ?? "",
    departures: (pkg.departures ?? []).map((d) => ({ departsOn: d.departsOn, tier: d.tier ?? "", priceUsd: d.priceUsd, seats: d.seats, note: d.note ?? "" })),
  };
}

type OperatorOpt = { id: number; name: string; markupPct: number | null };
type PricingInfo = { rate: number | null; step: number };
const clp = (n: number) => `$${n.toLocaleString("es-CL")}`;
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-CL", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

export function PackageForm({
  regions,
  existing,
  canDelete,
}: {
  regions: Region[];
  existing: PackageDetail | null;
  canDelete: boolean;
}) {
  const navigate = useNavigate();
  const [form, setForm] = useState<PackageInput>(existing ? fromDetail(existing) : emptyInput());
  const [images, setImages] = useState<ImageItem[]>(
    existing ? existing.images.map((i) => ({ id: i.id, extension: i.extension })) : []
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operators, setOperators] = useState<OperatorOpt[]>([]);
  const [pricing, setPricing] = useState<PricingInfo>({ rate: null, step: 1000 });
  const [showPast, setShowPast] = useState(false);
  const [bulkDates, setBulkDates] = useState("");
  const [bulkTier, setBulkTier] = useState("");

  useEffect(() => {
    apiGet<{ operators: OperatorOpt[] }>("/api-operators.php?action=list").then((r) => { if (r.ok) setOperators(r.operators); });
    apiGet<PricingInfo>("/api-pricing.php?action=settings").then((r) => { if (r.ok) setPricing({ rate: r.rate, step: r.step }); });
  }, []);

  const operator = operators.find((o) => o.id === form.operatorId) ?? null;
  const computedClp =
    form.priceUsd != null && pricing.rate ? Math.round((form.priceUsd * (1 + (operator?.markupPct ?? 0) / 100) * pricing.rate) / pricing.step) * pricing.step : null;
  const today = new Date().toISOString().slice(0, 10);
  const expired = !!form.tariffValidUntil && form.tariffValidUntil < today;
  const upcoming = form.departures.filter((d) => d.departsOn >= today);
  const past = form.departures.filter((d) => d.departsOn < today);

  function addBulkDates() {
    const found: string[] = bulkDates.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    const have = new Set(form.departures.map((d) => `${d.departsOn}|${d.tier}`));
    const add = found.filter((d, i) => found.indexOf(d) === i && !have.has(`${d}|${bulkTier.trim()}`)).map((d) => ({ departsOn: d, tier: bulkTier.trim(), priceUsd: null, seats: null, note: "" }));
    update("departures", [...form.departures, ...add].sort((a, b) => a.departsOn.localeCompare(b.departsOn)));
    setBulkDates("");
  }

  function update<K extends keyof PackageInput>(key: K, value: PackageInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    const result = await apiUpload<{ id: string; extension: string }>("/api-uploads.php", file);
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setImages((prev) => [...prev, { id: result.id, extension: result.extension }]);
    setForm((prev) => ({ ...prev, imageIds: [...prev.imageIds, result.id] }));
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((i) => i.id !== id));
    setForm((prev) => ({ ...prev, imageIds: prev.imageIds.filter((i) => i !== id) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const action = existing
      ? `/api-packages.php?action=update&id=${existing.id}`
      : "/api-packages.php?action=create";
    const result = await apiPost<{ id: string }>(action, form);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate("/paquetes");
  }

  async function handleDelete() {
    if (!existing) return;
    if (!confirm(`¿Eliminar "${existing.title}"? No se puede deshacer.`)) return;
    await apiPost(`/api-packages.php?action=delete&id=${existing.id}`, {});
    navigate("/paquetes");
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-8">
      <section className="space-y-4">
        <h2 className="font-semibold text-brand-dark">Datos generales</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Título">
            <input
              required
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Slug (URL)">
            <input
              required
              value={form.slug}
              onChange={(e) => update("slug", e.target.value)}
              className="input"
              placeholder="circuito-madrid-paris"
            />
          </Field>
        </div>
        <Field label="Subtítulo">
          <input value={form.subtitle} onChange={(e) => update("subtitle", e.target.value)} className="input" />
        </Field>
        <Field label="Contenido / descripción">
          <textarea
            value={form.content}
            onChange={(e) => update("content", e.target.value)}
            rows={5}
            className="input"
          />
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Días">
            <input
              type="number"
              value={form.durationDays ?? ""}
              onChange={(e) => update("durationDays", e.target.value === "" ? null : Number(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="Noches">
            <input
              type="number"
              value={form.durationNights ?? ""}
              onChange={(e) => update("durationNights", e.target.value === "" ? null : Number(e.target.value))}
              className="input"
            />
          </Field>
          <Field label="Región">
            <select
              value={form.regionId ?? ""}
              onChange={(e) => update("regionId", e.target.value || null)}
              className="input"
            >
              <option value="">Sin región</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo de paquete">
            <select
              value={form.packageType}
              onChange={(e) => update("packageType", e.target.value as PackageInput["packageType"])}
              className="input"
            >
              <option value="circuito">Circuito</option>
              <option value="todo_incluido">Todo incluido</option>
              <option value="combinado">Combinado</option>
              <option value="promocion_2x1">Promoción 2x1</option>
            </select>
          </Field>
          <Field label="Estado">
            <select
              value={form.status}
              onChange={(e) => update("status", e.target.value as PackageInput["status"])}
              className="input"
            >
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
              <option value="archived">Archivado</option>
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isFeatured}
              onChange={(e) => update("isFeatured", e.target.checked)}
            />
            Destacado en el home
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.showInPromociones}
              onChange={(e) => update("showInPromociones", e.target.checked)}
            />
            Mostrar en Promociones
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-brand-dark">Precio</h2>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Modo de precio">
            <select
              value={form.priceDisplayMode}
              onChange={(e) => update("priceDisplayMode", e.target.value as PackageInput["priceDisplayMode"])}
              className="input"
            >
              <option value="bajo_consulta">Bajo consulta</option>
              <option value="desde">Desde</option>
              <option value="rango">Rango</option>
            </select>
          </Field>
          {form.priceDisplayMode !== "bajo_consulta" && (
            <>
              <Field label="Precio desde (CLP)">
                <input
                  type="number"
                  value={form.priceFromClp ?? ""}
                  onChange={(e) => update("priceFromClp", e.target.value === "" ? null : Number(e.target.value))}
                  className="input"
                />
              </Field>
              {form.priceDisplayMode === "rango" && (
                <Field label="Precio hasta (CLP)">
                  <input
                    type="number"
                    value={form.priceToClp ?? ""}
                    onChange={(e) => update("priceToClp", e.target.value === "" ? null : Number(e.target.value))}
                    className="input"
                  />
                </Field>
              )}
            </>
          )}
        </div>
        {form.priceDisplayMode !== "bajo_consulta" && (
          <Field label="Unidad">
            <select
              value={form.priceUnit}
              onChange={(e) => update("priceUnit", e.target.value as PackageInput["priceUnit"])}
              className="input max-w-xs"
            >
              <option value="per_person">Por pasajero</option>
              <option value="per_couple">Para 2 pasajeros</option>
            </select>
          </Field>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-brand-dark">Proveedor y tarifa en dólares</h2>
        <p className="text-[13px] text-foreground/60">Si el proveedor da el precio en USD, anótalo aquí. El precio en pesos se calcula con el tipo de cambio y el margen del proveedor; no se publica solo.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Proveedor">
            <select value={form.operatorId ?? ""} onChange={(e) => update("operatorId", e.target.value === "" ? null : Number(e.target.value))} className="input">
              <option value="">Sin proveedor</option>
              {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Precio original (USD)">
            <input type="number" min={0} step="0.01" value={form.priceUsd ?? ""} onChange={(e) => update("priceUsd", e.target.value === "" ? null : Number(e.target.value))} className="input" />
          </Field>
          <Field label="Tarifa válida hasta">
            <input type="date" value={form.tariffValidUntil ?? ""} onChange={(e) => update("tariffValidUntil", e.target.value || null)} className="input" />
          </Field>
        </div>
        {expired && <p className="rounded-lg bg-red-100 px-3 py-2 text-[13px] font-semibold text-red-900">⚠ La tarifa venció el {fmtDate(form.tariffValidUntil!)}. Pide una nueva al proveedor antes de publicar.</p>}
        {form.priceUsd != null && (
          <div className="rounded-lg border border-border bg-brand-light/40 px-3 py-2 text-[13px]">
            {pricing.rate ? (
              <>
                <b>{clp(computedClp ?? 0)} CLP</b> = USD {form.priceUsd.toLocaleString("es-CL")} × (1 + margen {operator?.markupPct ?? 0}%) × tipo de cambio ${pricing.rate.toLocaleString("es-CL")}, redondeado a ${pricing.step.toLocaleString("es-CL")}.
                <button type="button" className="ml-3 font-semibold text-brand hover:underline"
                  onClick={() => { update("priceDisplayMode", "desde"); update("priceFromClp", computedClp); }}>Usar este precio</button>
              </>
            ) : (
              <>Todavía no hay tipo de cambio definido, así que no se puede calcular el precio en pesos. Lo define quien administra el sistema (en Paquetes, panel de arriba).</>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-brand-dark">Salidas</h2>
        <Field label="Cuándo sale (texto que verá el cliente)">
          <input value={form.departuresText} maxLength={255} onChange={(e) => update("departuresText", e.target.value)} placeholder="Ej.: Todos los sábados · Diarias de abril a octubre" className="input" />
        </Field>
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground/80">Fechas de salida concretas ({upcoming.length} próximas{past.length ? `, ${past.length} pasadas` : ""})</p>
          {upcoming.length === 0 && <p className="text-[13px] text-foreground/50">No hay fechas próximas cargadas.</p>}
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {(showPast ? form.departures : upcoming).map((d) => (
              <div key={`${d.departsOn}|${d.tier}`} className={`flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[13px] ${d.departsOn < today ? "opacity-50" : ""}`}>
                <span className="w-44 font-medium">{fmtDate(d.departsOn)}</span>
                <input value={d.tier} placeholder="Tarifa / color" onChange={(e) => update("departures", form.departures.map((x) => (x === d ? { ...x, tier: e.target.value } : x)))} className="input h-8 w-36" />
                <input type="number" min={0} step="0.01" value={d.priceUsd ?? ""} placeholder="USD" onChange={(e) => update("departures", form.departures.map((x) => (x === d ? { ...x, priceUsd: e.target.value === "" ? null : Number(e.target.value) } : x)))} className="input h-8 w-24" />
                <input type="number" min={0} value={d.seats ?? ""} placeholder="Cupos" onChange={(e) => update("departures", form.departures.map((x) => (x === d ? { ...x, seats: e.target.value === "" ? null : Number(e.target.value) } : x)))} className="input h-8 w-20" />
                <button type="button" className="ml-auto text-sm text-red-600" onClick={() => update("departures", form.departures.filter((x) => x !== d))}>Quitar</button>
              </div>
            ))}
          </div>
          {past.length > 0 && (
            <button type="button" className="text-[13px] font-semibold text-brand hover:underline" onClick={() => setShowPast((v) => !v)}>
              {showPast ? "Ocultar las pasadas" : `Mostrar las ${past.length} pasadas`}
            </button>
          )}
        </div>
        <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <p className="text-[13px] font-semibold">Agregar varias fechas</p>
          <p className="text-[12.5px] text-foreground/60">Escríbelas o pégalas con formato año-mes-día (2027-03-07), separadas por coma, espacio o salto de línea.</p>
          <textarea value={bulkDates} onChange={(e) => setBulkDates(e.target.value)} rows={2} placeholder="2027-03-07, 2027-03-14, 2027-03-21" className="input" />
          <div className="flex flex-wrap items-center gap-2">
            <input value={bulkTier} onChange={(e) => setBulkTier(e.target.value)} placeholder="Tarifa / color (opcional)" className="input h-9 w-56" />
            <button type="button" className="rounded-full border border-brand px-4 py-1.5 text-sm font-semibold text-brand hover:bg-brand-light/50 disabled:opacity-40" disabled={!/\d{4}-\d{2}-\d{2}/.test(bulkDates)} onClick={addBulkDates}>Agregar fechas</button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-brand-dark">Incluye / no incluye</h2>
        <Field label="Incluye (un ítem por línea)">
          <textarea
            value={form.included}
            onChange={(e) => update("included", e.target.value)}
            rows={4}
            className="input"
          />
        </Field>
        <Field label="No incluye (un ítem por línea)">
          <textarea
            value={form.notIncluded}
            onChange={(e) => update("notIncluded", e.target.value)}
            rows={4}
            className="input"
          />
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-brand-dark">Notas internas</h2>
        <Field label="Proveedor, precio original en otra moneda, salidas, vigencia, dudas… (solo para el equipo, NO se ve en el sitio)">
          <textarea
            value={form.internalNotes}
            onChange={(e) => update("internalNotes", e.target.value)}
            rows={4}
            className="input"
          />
        </Field>
      </section>

      <ListEditor
        title="Excursiones opcionales"
        items={form.addons}
        onChange={(addons) => update("addons", addons)}
        renderRow={(item, onChange) => (
          <>
            <input
              placeholder="Nombre"
              value={item.name}
              onChange={(e) => onChange({ ...item, name: e.target.value })}
              className="input flex-1"
            />
            <input
              type="number"
              placeholder="Precio CLP"
              value={item.priceClp}
              onChange={(e) => onChange({ ...item, priceClp: Number(e.target.value) })}
              className="input w-32"
            />
          </>
        )}
        empty={{ name: "", priceClp: 0 }}
      />

      <ListEditor
        title="Tipos de habitación"
        items={form.roomOptions}
        onChange={(roomOptions) => update("roomOptions", roomOptions)}
        renderRow={(item, onChange) => (
          <>
            <input
              placeholder="Etiqueta (ej. Individual)"
              value={item.label}
              onChange={(e) => onChange({ ...item, label: e.target.value })}
              className="input flex-1"
            />
            <input
              type="number"
              placeholder="Ajuste CLP"
              value={item.priceAdjustmentClp}
              onChange={(e) => onChange({ ...item, priceAdjustmentClp: Number(e.target.value) })}
              className="input w-32"
            />
          </>
        )}
        empty={{ label: "", priceAdjustmentClp: 0 }}
      />

      <ListEditor
        title="Itinerario día por día"
        items={form.itinerary}
        onChange={(itinerary) => update("itinerary", itinerary)}
        renderRow={(item, onChange) => (
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Día #"
                value={item.dayNumber ?? ""}
                onChange={(e) =>
                  onChange({ ...item, dayNumber: e.target.value === "" ? null : Number(e.target.value) })
                }
                className="input w-24"
              />
              <input
                placeholder="Título del día"
                value={item.title}
                onChange={(e) => onChange({ ...item, title: e.target.value })}
                className="input flex-1"
              />
            </div>
            <textarea
              placeholder="Descripción"
              value={item.description}
              onChange={(e) => onChange({ ...item, description: e.target.value })}
              rows={2}
              className="input"
            />
          </div>
        )}
        empty={{ dayNumber: null, title: "", description: "" }}
      />

      <section className="space-y-4">
        <h2 className="font-semibold text-brand-dark">Fotos</h2>
        <div className="grid grid-cols-4 gap-3">
          {images.map((img) => (
            <div key={img.id} className="relative aspect-square overflow-hidden rounded-lg ring-1 ring-border">
              <img
                src={`/uploads/${img.id}.${img.extension}`}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <label className="inline-block cursor-pointer rounded-lg border border-dashed border-border px-4 py-2 text-sm text-foreground/60 hover:bg-brand-light/30">
          {uploading ? "Subiendo..." : "Agregar foto"}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between border-t border-border pt-6">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-brand px-6 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
        {existing && canDelete && (
          <button type="button" onClick={handleDelete} className="text-sm text-red-600 hover:underline">
            Eliminar paquete
          </button>
        )}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-brand-dark">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ListEditor<T>({
  title,
  items,
  onChange,
  renderRow,
  empty,
}: {
  title: string;
  items: T[];
  onChange: (items: T[]) => void;
  renderRow: (item: T, onChange: (next: T) => void) => React.ReactNode;
  empty: T;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-brand-dark">{title}</h2>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          {renderRow(item, (next) => {
            const copy = [...items];
            copy[i] = next;
            onChange(copy);
          })}
          <button
            type="button"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="mt-1 text-sm text-red-600"
          >
            Quitar
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, empty])}
        className="text-sm font-medium text-brand hover:underline"
      >
        + Agregar
      </button>
    </section>
  );
}
