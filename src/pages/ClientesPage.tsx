import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { AttendBadge } from "@/components/crm/ui";
import type { ClientSummary } from "@/lib/types";

const PER_PAGE = 25;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesDe = (iso: string | null) => (iso ? iso.slice(0, 7) : "");
const mesTxt = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

export default function ClientesPage() {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const origin = params.get("origin") ?? "";
  const att = params.get("att") ?? "";
  const kind = params.get("kind") ?? "";
  const month = params.get("month") ?? "";
  const sort = params.get("sort") ?? "prioridad";

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    apiGet<{ clients: ClientSummary[] }>("/api-clients.php?action=list").then((res) => {
      if (res.ok) setClients(res.clients);
    });
  }, []);

  // Búsqueda con pequeña espera para no recalcular por cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== search) set("q", search.trim());
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const months = useMemo(
    () => Array.from(new Set((clients ?? []).filter((c) => c.recovered).map((c) => mesDe(c.firstRequestAt)).filter(Boolean))).sort().reverse(),
    [clients]
  );

  const filtered = useMemo(() => {
    const q = (params.get("q") ?? "").toLowerCase();
    const list = (clients ?? []).filter((c) => {
      if (origin === "rescatados" && !c.recovered) return false;
      if (origin === "sitio" && c.recovered) return false;
      if (att === "pendiente" && !(c.recovered && c.pending)) return false;
      if (att === "atendido" && !(c.recovered && !c.pending)) return false;
      if (kind === "posventa" && !c.posventa) return false;
      if (kind === "lead" && (!c.recovered || c.posventa)) return false;
      if (month && mesDe(c.firstRequestAt) !== month) return false;
      if (!q) return true;
      return [c.name, c.email, c.phone ?? "", c.lastDestination ?? ""].some((v) => v.toLowerCase().includes(q));
    });
    const wait = (c: ClientSummary) => c.firstRequestAt ?? c.createdAt;
    list.sort((a, b) => {
      if (sort === "antiguos") return wait(a).localeCompare(wait(b));
      if (sort === "recientes") return wait(b).localeCompare(wait(a));
      if (sort === "nombre") return a.name.localeCompare(b.name, "es");
      // prioridad: por atender primero, posventa antes que consultas, y dentro de cada grupo el que lleva más tiempo esperando
      const rank = (c: ClientSummary) => (c.recovered && c.pending ? (c.posventa ? 0 : 1) : 2);
      return rank(a) - rank(b) || wait(a).localeCompare(wait(b));
    });
    return list;
  }, [clients, params, origin, att, kind, month, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const cur = Math.min(page, pages);
  const rows = filtered.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);
  const pendientes = (clients ?? []).filter((c) => c.recovered && c.pending).length;
  const hasFilters = ["q", "origin", "att", "kind", "month", "sort"].some((k) => params.get(k));

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Clientes</h1>
      <p className="mt-1 text-sm text-foreground/60">
        Cuentas de visitantes del sitio y clientes rescatados del correo info@travelviajes.cl.
        {clients && pendientes > 0 && <b className="ml-1 text-foreground">{pendientes} rescatados por atender.</b>}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Buscar por nombre, correo, teléfono o destino..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input max-w-sm"
          aria-label="Buscar clientes"
        />
        <select className="input w-auto" value={origin} onChange={(e) => set("origin", e.target.value)} aria-label="Origen">
          <option value="">Todo el origen</option>
          <option value="rescatados">📬 Rescatados del correo</option>
          <option value="sitio">Registrados en el sitio</option>
        </select>
        <select className="input w-auto" value={att} onChange={(e) => set("att", e.target.value)} aria-label="Atención">
          <option value="">Atención: todos</option>
          <option value="pendiente">Por atender</option>
          <option value="atendido">Ya atendidos</option>
        </select>
        <select className="input w-auto" value={kind} onChange={(e) => set("kind", e.target.value)} aria-label="Tipo">
          <option value="">Tipo: todos</option>
          <option value="posventa">Posventa (devolución, anulación, cambio)</option>
          <option value="lead">Consulta / cotización</option>
        </select>
        <select className="input w-auto" value={month} onChange={(e) => set("month", e.target.value)} aria-label="Mes en que escribió">
          <option value="">Cualquier mes</option>
          {months.map((m) => (
            <option key={m} value={m}>
              Escribió en {mesTxt(m)}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={sort} onChange={(e) => set("sort", e.target.value === "prioridad" ? "" : e.target.value)} aria-label="Orden">
          <option value="prioridad">Orden: prioridad (posventa y más esperando)</option>
          <option value="antiguos">Más antiguos primero</option>
          <option value="recientes">Más recientes primero</option>
          <option value="nombre">Nombre A–Z</option>
        </select>
        {hasFilters && (
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-muted"
            onClick={() => {
              setSearch("");
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-foreground/60">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Teléfono</th>
              <th className="px-4 py-3">Destino / interés</th>
              <th className="px-4 py-3">Atención</th>
              <th className="px-4 py-3">Verificado</th>
              <th className="px-4 py-3">Solicitudes</th>
              <th className="px-4 py-3">Escribió</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-brand-light/30">
                <td className="px-4 py-3">
                  <Link to={`/clientes/${c.id}`} className="font-medium text-brand-dark hover:underline">
                    {c.name}
                  </Link>
                  {c.recovered && (
                    <span className="block text-xs font-semibold text-foreground/60">
                      📬 Rescatado del correo{c.posventa ? " · Posventa" : ""}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-foreground/70">{c.email}</td>
                <td className="px-4 py-3 text-foreground/70">{c.phone ?? "—"}</td>
                <td className="max-w-[260px] px-4 py-3 text-foreground/70">{c.lastDestination ?? "—"}</td>
                <td className="px-4 py-3">{c.recovered ? <AttendBadge attended={!c.pending} /> : <span className="text-foreground/40">—</span>}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs ${c.emailVerified ? "bg-brand-light text-brand-dark" : "bg-surface-muted text-foreground/50"}`}>
                    {c.emailVerified ? "Sí" : "No"}
                  </span>
                </td>
                <td className="px-4 py-3 text-foreground/70">{c.quotesCount}</td>
                <td className="whitespace-nowrap px-4 py-3 text-foreground/70">
                  {new Date((c.firstRequestAt ?? c.createdAt).replace(" ", "T")).toLocaleDateString("es-CL")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!clients && <p className="px-4 py-6 text-center text-sm text-foreground/50">Cargando…</p>}
        {clients && filtered.length === 0 && <p className="px-4 py-6 text-center text-sm text-foreground/50">No hay clientes que coincidan.</p>}
      </div>

      {clients && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/50">
          <span>
            {filtered.length} de {clients.length} clientes · página {cur} de {pages} · {PER_PAGE} por página
          </span>
          <span className="flex gap-2">
            <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-40" disabled={cur <= 1} onClick={() => set("page", String(cur - 1))}>
              ← Anterior
            </button>
            <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-40" disabled={cur >= pages} onClick={() => set("page", String(cur + 1))}>
              Siguiente →
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
