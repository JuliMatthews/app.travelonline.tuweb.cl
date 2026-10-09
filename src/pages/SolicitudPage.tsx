import { Link, useParams } from "react-router-dom";
import { SolicitudDetail } from "@/components/crm/SolicitudDetail";

// Página completa de una solicitud (enlaces directos, p.ej. desde la ficha de un cliente).
export default function SolicitudPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/solicitudes" className="mb-4 inline-block text-[13px] font-semibold text-[color:var(--muted)] hover:text-foreground">
        ← Solicitudes
      </Link>
      <div className="crm-panel">
        <SolicitudDetail id={Number(id)} />
      </div>
    </div>
  );
}
