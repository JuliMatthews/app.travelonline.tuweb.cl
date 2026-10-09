import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import type { QuoteStats } from "@/lib/types";

// Estadísticas del CRM compartidas por el tablero, el panel lateral de KPIs y
// los contadores de la navegación. Cualquier pantalla que cambie una
// solicitud llama a reload() para que todo quede al día.
type CrmContextValue = {
  stats: QuoteStats | null;
  counts: { nuevas: number; urgentes: number };
  reload: () => void;
};

const CrmContext = createContext<CrmContextValue | null>(null);

export function CrmProvider({ children }: { children: React.ReactNode }) {
  const [stats, setStats] = useState<QuoteStats | null>(null);
  const [counts, setCounts] = useState({ nuevas: 0, urgentes: 0 });

  const reload = useCallback(() => {
    apiGet<{ stats: QuoteStats }>("/api-quotes.php?action=stats").then((res) => {
      if (res.ok) setStats(res.stats);
    });
    apiGet<{ nuevas: number; urgentes: number }>("/api-quotes.php?action=counts").then((res) => {
      if (res.ok) setCounts({ nuevas: res.nuevas, urgentes: res.urgentes });
    });
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 60000);
    return () => clearInterval(t);
  }, [reload]);

  return <CrmContext.Provider value={{ stats, counts, reload }}>{children}</CrmContext.Provider>;
}

export function useCrm(): CrmContextValue {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error("useCrm debe usarse dentro de <CrmProvider>");
  return ctx;
}
