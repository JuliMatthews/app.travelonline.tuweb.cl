import { useState } from "react";
import { apiPost } from "@/lib/api";
import type { QuoteDetail, QuoteStatus } from "@/lib/types";

type QuoteUser = { id: string; name: string };

export function QuoteDetailForm({
  quote,
  users,
  canEdit,
}: {
  quote: QuoteDetail;
  users: QuoteUser[];
  canEdit: boolean;
}) {
  const [status, setStatus] = useState<QuoteStatus>(quote.status);
  const [internalNotes, setInternalNotes] = useState(quote.internalNotes ?? "");
  const [assignedTo, setAssignedTo] = useState(quote.assignedTo ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await apiPost(`/api-quotes.php?action=update&id=${quote.id}`, {
      status,
      internalNotes,
      assignedTo: assignedTo || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
      <section className="space-y-4">
        <h2 className="font-semibold text-brand-dark">Detalle de la solicitud</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row label="Paquete" value={quote.packageTitle} />
          <Row label="Fecha" value={new Date(quote.createdAt).toLocaleString("es-CL")} />
          <Row label="Adultos / Niños" value={`${quote.adults} / ${quote.children}`} />
          <Row
            label="Fechas preferidas"
            value={
              quote.preferredDateFrom
                ? `${quote.preferredDateFrom} al ${quote.preferredDateTo}`
                : "—"
            }
          />
          <Row label="Habitación" value={quote.roomOptionLabel ?? "—"} />
          <Row
            label="Total"
            value={quote.totalClp != null ? `$${quote.totalClp.toLocaleString("es-CL")}` : "Bajo consulta"}
          />
          <Row
            label="Depósito sugerido (30%)"
            value={quote.depositSuggestedClp != null ? `$${quote.depositSuggestedClp.toLocaleString("es-CL")}` : "—"}
          />
        </dl>

        {quote.selectedAddons.length > 0 && (
          <div>
            <p className="text-sm font-medium text-brand-dark">Excursiones seleccionadas</p>
            <ul className="mt-1 text-sm text-foreground/70">
              {quote.selectedAddons.map((a) => (
                <li key={a.id}>
                  {a.name} — ${a.priceClp.toLocaleString("es-CL")}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-border pt-4">
          <h2 className="font-semibold text-brand-dark">Datos de contacto</h2>
          <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <Row label="Nombre" value={quote.passengerName} />
            <Row label="Correo" value={quote.passengerEmail} />
            <Row label="Teléfono" value={quote.passengerPhone} />
          </dl>
          {quote.comments && (
            <p className="mt-2 text-sm text-foreground/70">
              <span className="font-medium text-brand-dark">Comentarios: </span>
              {quote.comments}
            </p>
          )}
        </div>
      </section>

      <section className="h-fit rounded-2xl border border-border bg-brand-light/40 p-6">
        <h2 className="font-semibold text-brand-dark">Gestión interna</h2>
        <label className="mt-4 block text-sm font-medium text-brand-dark">Estado</label>
        <select
          disabled={!canEdit}
          value={status}
          onChange={(e) => setStatus(e.target.value as QuoteStatus)}
          className="input mt-1"
        >
          <option value="nueva">Nueva</option>
          <option value="en_proceso">En proceso</option>
          <option value="ganada">Ganada</option>
          <option value="perdida">Perdida</option>
        </select>

        <label className="mt-4 block text-sm font-medium text-brand-dark">Asignada a</label>
        <select
          disabled={!canEdit}
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          className="input mt-1"
        >
          <option value="">Sin asignar</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-sm font-medium text-brand-dark">Notas internas</label>
        <textarea
          disabled={!canEdit}
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={5}
          className="input mt-1"
        />

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {saved && !error && <p className="mt-2 text-sm text-green-700">Guardado.</p>}

        {canEdit && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="mt-4 w-full rounded-full bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-foreground/50">{label}</dt>
      <dd className="text-brand-dark">{value}</dd>
    </>
  );
}
