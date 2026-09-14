import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { QuoteSummary } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  nueva: "Nueva",
  en_proceso: "En proceso",
  ganada: "Ganada",
  perdida: "Perdida",
};

type QuoteUser = { id: string; name: string };

export default function CotizacionesPage() {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState<QuoteSummary[] | null>(null);
  const [users, setUsers] = useState<QuoteUser[]>([]);
  const [status, setStatus] = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  useEffect(() => {
    apiGet<{ users: QuoteUser[] }>("/api-quotes.php?action=users").then((res) => {
      if (res.ok) setUsers(res.users);
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ action: "list" });
    if (status) params.set("status", status);
    if (assignedTo) params.set("assignedTo", assignedTo);
    setQuotes(null);
    apiGet<{ quotes: QuoteSummary[] }>(`/api-quotes.php?${params.toString()}`).then((res) => {
      if (res.ok) setQuotes(res.quotes);
    });
  }, [status, assignedTo]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Cotizaciones</h1>

      <div className="mt-4 flex flex-wrap gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-auto">
          <option value="">Todos los estados</option>
          <option value="nueva">Nueva</option>
          <option value="en_proceso">En proceso</option>
          <option value="ganada">Ganada</option>
          <option value="perdida">Perdida</option>
        </select>

        <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="input w-auto">
          <option value="">Todas (cualquier asignación)</option>
          {user && <option value="me">Asignadas a mí</option>}
          <option value="unassigned">Sin asignar</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        {(status || assignedTo) && (
          <button
            type="button"
            onClick={() => {
              setStatus("");
              setAssignedTo("");
            }}
            className="text-sm text-brand underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-foreground/60">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Paquete</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Asignada a</th>
            </tr>
          </thead>
          <tbody>
            {(quotes ?? []).map((q) => (
              <tr key={q.id} className="border-b border-border last:border-0 hover:bg-brand-light/30">
                <td className="px-4 py-3 text-foreground/70">
                  {new Date(q.createdAt).toLocaleDateString("es-CL")}
                </td>
                <td className="px-4 py-3">
                  <Link to={`/cotizaciones/${q.id}`} className="font-medium text-brand-dark hover:underline">
                    {q.passengerName}
                  </Link>
                  <p className="text-xs text-foreground/50">{q.passengerEmail}</p>
                </td>
                <td className="px-4 py-3 text-foreground/70">{q.packageTitle}</td>
                <td className="px-4 py-3 text-foreground/70">
                  {q.totalClp != null ? `$${q.totalClp.toLocaleString("es-CL")}` : "Bajo consulta"}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-brand-light px-2 py-1 text-xs text-brand-dark">
                    {STATUS_LABEL[q.status] ?? q.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-foreground/70">{q.assignedToName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {quotes && quotes.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-foreground/50">No hay cotizaciones con estos filtros.</p>
        )}
      </div>
      {quotes && <p className="mt-3 text-xs text-foreground/40">{quotes.length} cotizaciones</p>}
    </div>
  );
}
