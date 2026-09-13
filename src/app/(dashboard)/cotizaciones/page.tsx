import Link from "next/link";
import { listQuotes } from "@/lib/quotes-repo";

const STATUS_LABEL: Record<string, string> = {
  nueva: "Nueva",
  en_proceso: "En proceso",
  ganada: "Ganada",
  perdida: "Perdida",
};

export default async function CotizacionesPage() {
  const quotes = await listQuotes();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-brand-dark">Cotizaciones</h1>

      <div className="mt-6 overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-black/10 text-left text-foreground/60">
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
            {quotes.map((q) => (
              <tr key={q.id} className="border-b border-black/5 last:border-0 hover:bg-brand-light/30">
                <td className="px-4 py-3 text-foreground/70">
                  {new Date(q.createdAt).toLocaleDateString("es-CL")}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/cotizaciones/${q.id}`} className="font-medium text-brand-dark hover:underline">
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
      </div>
      <p className="mt-3 text-xs text-foreground/40">{quotes.length} cotizaciones</p>
    </div>
  );
}
