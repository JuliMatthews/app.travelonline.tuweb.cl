import { useCallback, useEffect, useState } from "react";
import { Mail, MessageCircle, Phone, Plus, X } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { Operator } from "@/lib/types";

type Listing = { operators: Operator[]; countries: string[]; kinds: string[]; canEdit: boolean; showCommission: boolean };
const EMPTY: Operator = { id: 0, name: "", country: "", kind: "", destinations: "", contactName: "", email: "", phone: "", notes: "", isActive: true, commissionPct: null };

// Directorio de operadores y proveedores — modo consulta (contacto, país, destinos).
// La comisión solo aparece para los roles autorizados; editar, solo super admin.
export default function OperadoresPage() {
  const [data, setData] = useState<Listing | null>(null);
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [kind, setKind] = useState("");
  const [open, setOpen] = useState<Operator | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Operator>(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiGet<Listing>(`/api-operators.php?q=${encodeURIComponent(q)}&country=${encodeURIComponent(country)}&kind=${encodeURIComponent(kind)}`).then((res) => res.ok && setData(res));
  }, [q, country, kind]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function show(o: Operator, edit = false) {
    setOpen(o);
    setForm(o);
    setEditing(edit);
    setMsg(null);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const path = form.id ? `/api-operators.php?action=update&id=${form.id}` : "/api-operators.php?action=create";
    const res = await apiPost(path, form);
    setBusy(false);
    if (!res.ok) return setMsg(res.error);
    setOpen(null);
    load();
  }

  const phoneDigits = (open?.phone ?? "").replace(/\D/g, "");
  const set = <K extends keyof Operator>(k: K, v: Operator[K]) => setForm({ ...form, [k]: v });

  return (
    <div>
      <div className="crm-head">
        <div>
          <h1>Operadores y proveedores</h1>
          <p>Directorio de consulta para cotizar rápido · {data ? `${data.operators.length} resultado${data.operators.length === 1 ? "" : "s"}` : "cargando…"}</p>
        </div>
        {data?.canEdit && (
          <button type="button" className="crm-btn primary" onClick={() => show(EMPTY, true)}>
            <Plus size={15} /> Nuevo operador
          </button>
        )}
      </div>

      <div className="crm-filters">
        <input type="search" className="crm-field crm-search" placeholder="Buscar por nombre, destino, contacto o correo" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar operadores" />
        <select className="crm-field" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="País">
          <option value="">Todos los países</option>
          {data?.countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="crm-field" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {data?.kinds.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Operador</th>
              <th>País</th>
              <th>Tipo</th>
              <th>Destinos</th>
              <th>Contacto</th>
              {data?.showCommission && <th className="num">Comisión</th>}
            </tr>
          </thead>
          <tbody>
            {(data?.operators ?? []).map((o) => (
              <tr key={o.id} className="clic" tabIndex={0} onClick={() => show(o)} onKeyDown={(e) => e.key === "Enter" && show(o)}>
                <td><b>{o.name}</b>{!o.isActive && <span className="sub">inactivo</span>}</td>
                <td>{o.country}</td>
                <td>{o.kind}</td>
                <td className="min-w-[180px]">{o.destinations || "—"}</td>
                <td>{o.contactName ?? "—"}<span className="sub">{o.email ?? ""}</span></td>
                {data?.showCommission && <td className="num">{o.commissionPct != null ? `${o.commissionPct}%` : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.operators.length === 0 && <p className="crm-empty">No hay operadores con estos filtros.</p>}
      </div>

      {open && (
        <div className="crm-overlay" onClick={() => setOpen(null)}>
          <div className="crm-drawer" style={{ width: "min(720px, 100%)" }} role="dialog" aria-modal="true" aria-label="Operador" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2>{editing ? (form.id ? "Editar operador" : "Nuevo operador") : open.name}</h2>
              <button type="button" onClick={() => setOpen(null)} aria-label="Cerrar" className="rounded-lg p-1.5 text-[color:var(--muted)] hover:bg-surface-muted">
                <X size={19} />
              </button>
            </div>

            {!editing ? (
              <>
                <p className="mt-1 text-[13px] text-[color:var(--muted)]">{[open.kind, open.country].filter(Boolean).join(" · ")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {open.email && <a className="crm-btn" href={`mailto:${open.email}`}><Mail size={15} /> Correo</a>}
                  {open.phone && <a className="crm-btn" href={`tel:${open.phone}`}><Phone size={15} /> Llamar</a>}
                  {phoneDigits && <a className="crm-btn" href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a>}
                </div>
                <dl className="crm-ficha mt-3">
                  <dt>Contacto</dt><dd>{open.contactName ?? "—"}</dd>
                  <dt>Correo</dt><dd>{open.email ?? "—"}</dd>
                  <dt>Teléfono</dt><dd>{open.phone ?? "—"}</dd>
                  <dt>Destinos</dt><dd>{open.destinations || "—"}</dd>
                  {data?.showCommission && (<><dt>Comisión</dt><dd>{open.commissionPct != null ? `${open.commissionPct}%` : "—"}</dd></>)}
                  <dt>Notas</dt><dd>{open.notes ?? "—"}</dd>
                </dl>
                {data?.canEdit && (
                  <div className="mt-4 flex justify-end">
                    <button type="button" className="crm-btn" onClick={() => setEditing(true)}>Editar</button>
                  </div>
                )}
              </>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="block text-[12.5px] font-semibold md:col-span-2">Nombre<input className="crm-field" value={form.name} onChange={(e) => set("name", e.target.value)} /></label>
                <label className="block text-[12.5px] font-semibold">País<input className="crm-field" value={form.country} onChange={(e) => set("country", e.target.value)} /></label>
                <label className="block text-[12.5px] font-semibold">Tipo (mayorista, receptivo, aerolínea…)<input className="crm-field" value={form.kind} onChange={(e) => set("kind", e.target.value)} /></label>
                <label className="block text-[12.5px] font-semibold md:col-span-2">Destinos (separados por coma)<input className="crm-field" value={form.destinations} onChange={(e) => set("destinations", e.target.value)} /></label>
                <label className="block text-[12.5px] font-semibold">Contacto<input className="crm-field" value={form.contactName ?? ""} onChange={(e) => set("contactName", e.target.value)} /></label>
                <label className="block text-[12.5px] font-semibold">Comisión (%)<input className="crm-field" inputMode="decimal" value={form.commissionPct ?? ""} onChange={(e) => set("commissionPct", e.target.value === "" ? null : Number(e.target.value.replace(",", ".")))} /></label>
                <label className="block text-[12.5px] font-semibold">Correo<input className="crm-field" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></label>
                <label className="block text-[12.5px] font-semibold">Teléfono<input className="crm-field" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></label>
                <label className="block text-[12.5px] font-semibold md:col-span-2">Notas<textarea className="crm-field" value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></label>
                {form.id > 0 && (
                  <label className="flex items-center gap-2 text-[13px] md:col-span-2">
                    <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Activo (los inactivos se ocultan de la lista)
                  </label>
                )}
                {msg && <p className="text-[13px] text-[color:var(--risk)] md:col-span-2">{msg}</p>}
                <div className="flex justify-end gap-2 md:col-span-2">
                  <button type="button" className="crm-btn" onClick={() => (form.id ? setEditing(false) : setOpen(null))}>Cancelar</button>
                  <button type="button" className="crm-btn primary" disabled={busy || !form.name.trim()} onClick={save}>Guardar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
