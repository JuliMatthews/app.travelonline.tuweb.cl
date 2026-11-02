import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import type { AlertCfg, QuoteStats } from "@/lib/types";
import { ALERT_DEFAULT } from "@/lib/crm";

// Estadísticas del CRM compartidas por el tablero, el panel lateral de KPIs y
// los contadores de la navegación. Cualquier pantalla que cambie una
// solicitud llama a reload() para que todo quede al día.
type CrmContextValue = {
  stats: QuoteStats | null;
  counts: { nuevas: number; urgentes: number; cotVencidas: number; canalesSilencio: number };
  alertCfg: AlertCfg;
  reload: () => void;
};

const CrmContext = createContext<CrmContextValue | null>(null);

export function CrmProvider({ children }: { children: React.ReactNode }) {
  const [stats, setStats] = useState<QuoteStats | null>(null);
  const [counts, setCounts] = useState({ nuevas: 0, urgentes: 0, cotVencidas: 0, canalesSilencio: 0 });
  const [alertCfg, setAlertCfg] = useState<AlertCfg>(ALERT_DEFAULT);

  const reload = useCallback(() => {
    apiGet<{ stats: QuoteStats }>("/api-quotes.php?action=stats").then((res) => {
      if (res.ok) setStats(res.stats);
    });
    apiGet<{ nuevas: number; urgentes: number; cotVencidas: number; canalesSilencio: number; alert: AlertCfg }>("/api-quotes.php?action=counts").then((res) => {
      if (res.ok && res.alert) setAlertCfg(res.alert);
      if (res.ok) setCounts({ nuevas: res.nuevas, urgentes: res.urgentes, cotVencidas: res.cotVencidas ?? 0, canalesSilencio: res.canalesSilencio ?? 0 });
    });
  }, []);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 60000);
    return () => clearInterval(t);
  }, [reload]);

  return <CrmContext.Provider value={{ stats, counts, alertCfg, reload }}>{children}</CrmContext.Provider>;
}

export function useCrm(): CrmContextValue {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error("useCrm debe usarse dentro de <CrmProvider>");
  return ctx;
}
