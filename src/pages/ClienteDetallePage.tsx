import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import type { ClientDetail, ClientQuoteSummary } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/crm";


export default function ClienteDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canEdit = can(user, "clients:edit");

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [quotes, setQuotes] = useState<ClientQuoteSummary[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiGet<{ client: ClientDetail; quotes: ClientQuoteSummary[] }>(`/api-clients.php?action=get&id=${id}`).then((res) => {
      if (res.ok) {
        setClient(res.client);
        setQuotes(res.quotes);
        setNotes(res.client.internalNotes ?? "");
      } else {
        setNotFound(true);
      }
    });
  }, [id]);

  async function handleSaveNotes() {
    if (!id) return;
    setSaving(true);
    setSaved(false);
    const result = await apiPost(`/api-clients.php?action=update&id=${id}`, { internalNotes: notes });
    setSaving(false);
    if (result.ok) setSaved(true);
  }

  if (notFound) return <p className="text-foreground/60">Cliente no encontrado.</p>;
  if (!client) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">{client.name}</h1>
      <p className="text-sm text-foreground/60">{client.email}</p>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1.3fr_1fr]">
        <section className="space-y-6">
          <div className="card p-5">
            <h2 className="font-semibold text-brand-dark">Datos de contacto</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <dt className="text-foreground/50">Teléfono</dt>
              <dd className="text-foreground">{client.phone ?? "—"}</dd>
              <dt className="text-foreground/50">Correo verificado</dt>
              <dd className="text-foreground">{client.emailVerified ? "Sí" : "No"}</dd>
              <dt className="text-foreground/50">Entra con</dt>
              <dd className="text-foreground">
                {[client.hasGoogle && "Google", client.hasPassword && "Correo/contraseña"].filter(Boolean).join(" y ") || "—"}
              </dd>
              <dt className="text-foreground/50">Registrado</dt>
              <dd className="text-foreground">{new Date(client.createdAt).toLocaleDateString("es-CL")}</dd>
              <dt className="text-foreground/50">Último ingreso</dt>
              <dd className="text-foreground">
                {client.lastLoginAt ? new Date(client.lastLoginAt).toLocaleString("es-CL") : "—"}
              </dd>
            </dl>
          </div>

          <div>
            <h2 className="font-semibold text-brand-dark">Cotizaciones ({quotes.length})</h2>
            <div className="mt-3 space-y-2">
              {quotes.map((q) => (
                <Link
                  key={q.id}
                  to={`/solicitudes/${q.id}`}
                  className="block rounded-xl border border-border bg-surface p-4 hover:bg-brand-light/20"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-brand-dark">{q.packageTitle}</p>
                    <span className="rounded-full bg-brand-light px-2 py-1 text-xs text-brand-dark">
                      {STATUS_LABEL[q.status] ?? q.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-foreground/50">{new Date(q.createdAt).toLocaleDateString("es-CL")}</p>
                  <p className="mt-1 text-sm text-foreground/70">
                    {q.totalClp != null ? `$${q.totalClp.toLocaleString("es-CL")}` : "Bajo consulta"}
                  </p>
                </Link>
              ))}
              {quotes.length === 0 && <p className="text-sm text-foreground/50">Sin cotizaciones todavía.</p>}
            </div>
          </div>
        </section>

        <section className="h-fit rounded-2xl border border-border bg-brand-light/40 p-6">
          <h2 className="font-semibold text-brand-dark">Notas internas</h2>
          <textarea
            disabled={!canEdit}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            className="input mt-2"
            placeholder="Notas visibles solo para el equipo..."
          />
          {saved && <p className="mt-2 text-sm text-green-700">Guardado.</p>}
          {canEdit && (
            <button
              type="button"
              onClick={handleSaveNotes}
              disabled={saving}
              className="btn-primary mt-3 w-full justify-center"
            >
              {saving ? "Guardando..." : "Guardar notas"}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
