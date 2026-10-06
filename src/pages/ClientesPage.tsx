import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "@/lib/api";
import type { ClientSummary } from "@/lib/types";

export default function ClientesPage() {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiGet<{ clients: ClientSummary[] }>("/api-clients.php?action=list").then((res) => {
      if (res.ok) setClients(res.clients);
    });
  }, []);

  const filtered = (clients ?? []).filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Clientes</h1>
      <p className="mt-1 text-sm text-foreground/60">
        Cuentas creadas por visitantes en el sitio público (Google o correo+contraseña).
      </p>

      <input
        type="text"
        placeholder="Buscar por nombre o correo..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input mt-4 max-w-sm"
      />

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-foreground/60">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Teléfono</th>
              <th className="px-4 py-3">Verificado</th>
              <th className="px-4 py-3">Cotizaciones</th>
              <th className="px-4 py-3">Registrado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-brand-light/30">
                <td className="px-4 py-3">
                  <Link to={`/clientes/${c.id}`} className="font-medium text-brand-dark hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-foreground/70">{c.email}</td>
                <td className="px-4 py-3 text-foreground/70">{c.phone ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs ${c.emailVerified ? "bg-brand-light text-brand-dark" : "bg-surface-muted text-foreground/50"}`}>
                    {c.emailVerified ? "Sí" : "No"}
                  </span>
                </td>
                <td className="px-4 py-3 text-foreground/70">{c.quotesCount}</td>
                <td className="px-4 py-3 text-foreground/70">
                  {new Date(c.createdAt).toLocaleDateString("es-CL")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {clients && filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-foreground/50">No hay clientes que coincidan.</p>
        )}
      </div>
      {clients && <p className="mt-3 text-xs text-foreground/40">{filtered.length} de {clients.length} clientes</p>}
    </div>
  );
}
