import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { hasOriginPlaceholder, replaceOrigin } from "@/lib/itinerario";
import type { ItineraryDay } from "@/lib/types";

type CatalogPackage = { id: string; title: string; status: "published" | "draft"; region: string | null; days: number; keywords: string };

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Selector de itinerarios del catálogo de paquetes: buscar, ver los días y cargarlos en la cotización como copia editable.
// La búsqueda se hace en el navegador (el catálogo es chico); si crece y se nota lento, se mueve al servidor.
export type CatalogExtras = { title?: string; includes?: string; excludes?: string; priceUsd?: number | null };
type CatalogInfo = { title: string; days: ItineraryDay[]; includes: string | null; excludes: string | null; priceUsd: number | null; durationDays: number | null };

export function CatalogoItinerarios({
  hasDays,
  hasCustomLists,
  onPick,
  onClose,
}: {
  hasDays: boolean;
  /** true si ya escribió su propio "incluye / no incluye" (distinto del texto por defecto) */
  hasCustomLists: boolean;
  onPick: (days: ItineraryDay[], pkg: { id: string; title: string }, mode: "replace" | "append", extras: CatalogExtras) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<CatalogPackage[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [drafts, setDrafts] = useState(true);
  const [sel, setSel] = useState<CatalogPackage | null>(null);
  const [info, setInfo] = useState<CatalogInfo | null>(null);
  const [loadTitle, setLoadTitle] = useState(false);
  const [loadLists, setLoadLists] = useState(!hasCustomLists);
  const [origin, setOrigin] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    apiGet<{ packages: CatalogPackage[] }>("/api-quotations.php?action=catalog").then((res) =>
      res.ok ? setList(res.packages) : setError(res.error)
    );
  }, []);

  const regions = useMemo(() => Array.from(new Set((list ?? []).map((p) => p.region).filter(Boolean) as string[])).sort(), [list]);

  const filtered = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return (list ?? []).filter((p) => {
      if (!drafts && p.status !== "published") return false;
      if (region && p.region !== region) return false;
      const hay = norm(`${p.title} ${p.region ?? ""} ${p.keywords}`);
      return words.every((w) => hay.includes(w));
    });
  }, [list, q, region, drafts]);

  async function choose(p: CatalogPackage) {
    setSel(p);
    setInfo(null);
    setOpen(null);
    const res = await apiGet<CatalogInfo>(`/api-quotations.php?action=catalog_itinerary&packageId=${encodeURIComponent(p.id)}`);
    if (res.ok) setInfo(res);
    else setError(res.error);
  }

  const days = info?.days ?? null;
  const finalDays = days ? replaceOrigin(days, origin) : [];
  const hasLists = !!(info?.includes || info?.excludes);
  const extras = (): CatalogExtras => ({
    title: loadTitle && info ? info.title : undefined,
    includes: loadLists && info?.includes ? info.includes : undefined,
    excludes: loadLists && info?.excludes ? info.excludes : undefined,
    priceUsd: info?.priceUsd ?? null,
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Elegir un itinerario del catálogo" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Elegir un itinerario del catálogo</h2>
            <p className="text-[12.5px] text-[color:var(--muted)]">Se carga una copia en esta cotización: puedes editarla sin tocar el paquete original.</p>
          </div>
          <button type="button" className="crm-btn" onClick={onClose} aria-label="Cerrar">Cerrar ✕</button>
        </div>

        <input
          className="crm-field mt-3 block w-full"
          placeholder="Buscar por nombre o ciudad (ej: Madrid, Capri, Japón)…"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <button type="button" className={`crm-btn${region === "" ? " primary" : ""}`} onClick={() => setRegion("")}>Todas</button>
          {regions.map((r) => (
            <button key={r} type="button" className={`crm-btn${region === r ? " primary" : ""}`} onClick={() => setRegion(r)}>{r}</button>
          ))}
          <label className="ml-auto flex items-center gap-1.5">
            <input type="checkbox" checked={drafts} onChange={(e) => setDrafts(e.target.checked)} /> Mostrar borradores
          </label>
        </div>

        {error && <p className="mt-2 text-[13px] text-[color:var(--risk)]">{error}</p>}
        {!list && !error && <p className="mt-3 text-[13px] text-[color:var(--muted)]">Cargando catálogo…</p>}

        {list && (
          <div className="mt-3 grid min-h-0 flex-1 gap-3 md:grid-cols-2">
            <div className="min-h-0 overflow-auto rounded-lg border border-[var(--border)]" style={{ maxHeight: "46vh" }}>
              {filtered.length === 0 && <p className="p-3 text-[13px] text-[color:var(--muted)]">No hay itinerarios que coincidan con la búsqueda.</p>}
              <ul>
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => choose(p)}
                      className="block w-full border-b border-[var(--border)] px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-muted,rgba(127,127,127,.12))]"
                      style={sel?.id === p.id ? { background: "rgba(127,127,127,.18)" } : undefined}
                    >
                      <b>{p.title}</b>
                      <span className="block text-[12px] text-[color:var(--muted)]">
                        {p.region ?? "Sin región"} · {p.days} días · {p.status === "published" ? "Publicado" : "Borrador"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="p-2 text-[11.5px] text-[color:var(--muted)]">{filtered.length} de {list.length} itinerarios</p>
            </div>

            <div className="min-h-0 overflow-auto rounded-lg border border-[var(--border)] p-3" style={{ maxHeight: "46vh" }}>
              {!sel && <p className="text-[13px] text-[color:var(--muted)]">Elige un itinerario de la lista para ver sus días.</p>}
              {sel && !info && <p className="text-[13px] text-[color:var(--muted)]">Cargando días…</p>}
              {sel && info && days && (
                <>
                  <p className="text-[13px] font-semibold">{sel.title} · {days.length} días</p>
                  {sel.status === "draft" && (
                    <p className="text-[12px] text-[color:var(--muted)]">Es un borrador: sus datos pueden ser provisorios. Revísalo antes de enviar.</p>
                  )}
                  <div className="mt-2 space-y-1 rounded-md border border-[var(--border)] p-2 text-[12.5px]">
                    <p className="font-semibold">Además del itinerario, cargar:</p>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={loadTitle} onChange={(e) => setLoadTitle(e.target.checked)} /> El título del programa («{info?.title}»)
                    </label>
                    {hasLists ? (
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={loadLists} onChange={(e) => setLoadLists(e.target.checked)} /> Lo que incluye y no incluye{hasCustomLists ? " (reemplaza lo que ya escribiste)" : ""}
                      </label>
                    ) : (
                      <p className="text-[color:var(--muted)]">Este paquete no tiene «incluye / no incluye» cargado.</p>
                    )}
                    {info?.priceUsd != null && <p className="text-[color:var(--muted)]">Precio base del paquete: USD {info.priceUsd.toLocaleString("es-CL")}.</p>}
                  </div>
                  {hasOriginPlaceholder(days) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">
                      <span>Dice «CIUDAD DE ORIGEN». Reemplazar por:</span>
                      <input className="crm-field" style={{ maxWidth: 160 }} placeholder="Ej: Santiago" value={origin} onChange={(e) => setOrigin(e.target.value)} />
                    </div>
                  )}
                  <ul className="mt-2 text-[12.5px]">
                    {finalDays.map((d, i) => (
                      <li key={i} className="border-b border-[var(--border)] py-1">
                        <button type="button" className="w-full text-left font-semibold" onClick={() => setOpen(open === i ? null : i)}>
                          {open === i ? "▾" : "▸"} {d.title}
                        </button>
                        {open === i && <p className="mt-1 whitespace-pre-line text-[color:var(--muted)]">{d.detail}</p>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" className="crm-btn" onClick={onClose}>Cancelar</button>
          {sel && info && hasDays && (
            <button type="button" className="crm-btn" onClick={() => onPick(finalDays, { id: sel.id, title: sel.title }, "append", extras())}>Agregar al final</button>
          )}
          {sel && info && (
            <button type="button" className="crm-btn primary" onClick={() => onPick(finalDays, { id: sel.id, title: sel.title }, "replace", extras())}>
              {hasDays ? "Reemplazar el día por día" : "Usar este itinerario"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
