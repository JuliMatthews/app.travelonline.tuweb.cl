import { useEffect } from "react";

// Ayuda dentro del panel: consejos según la pantalla en que estás, acceso al asistente y un correo ya escrito para pedirle algo a Julio.
// El correo NO va en el código (el repositorio es público): se define al compilar en .env.local como VITE_CORREO_SOPORTE.
const CORREO_SOPORTE = (import.meta.env.VITE_CORREO_SOPORTE as string | undefined) ?? "";
// Lleva a la lista de proyectos de la cuenta de Claude; si se tiene el enlace directo del proyecto del asistente, se puede poner aquí.
const ASISTENTE_URL = "https://claude.ai/projects";

type Tip = { titulo: string; texto: string };

function consejos(path: string): { titulo: string; tips: Tip[] } {
  if (/\/solicitudes\/\d+\/cotizacion/.test(path)) {
    return {
      titulo: "Armar una cotización",
      tips: [
        { titulo: "Todo se cotiza aquí", texto: "Arma la cotización dentro del panel para que quede el total, el itinerario y el historial. Si te falta algo para poder hacerlo, pídeselo a Julio." },
        { titulo: "Itinerario", texto: "«Elegir del catálogo» carga un itinerario ya guardado; «Pegar itinerario completo» separa solo los días. Los días se pueden editar, y «Limpiar todo el itinerario» los quita de una vez." },
        { titulo: "Vuelos", texto: "«Pegar tabla de vuelos»: copia la tabla del portal, pégala y revisa. Marca el equipaje y la aerolínea a mano." },
        { titulo: "Montos en dólares", texto: "En cada línea cambia CLP por USD y escribe el monto en dólares: se convierte solo con el dólar del sistema." },
        { titulo: "Enviar", texto: "Los botones «Enviar al correo» y «Enviar al cliente» están en la pantalla del PDF (botón «Ver / guardar PDF»). Después vuelve y pulsa «Marcar como enviada»." },
        { titulo: "Revisión", texto: "El cuadro «Revisión antes de enviar» te avisa si falta algo. Son avisos: no te impiden enviar." },
      ],
    };
  }
  if (path.startsWith("/solicitudes")) {
    return {
      titulo: "Solicitudes",
      tips: [
        { titulo: "Qué atender primero", texto: "El número rojo del menú cuenta las cotizaciones vencidas; si no hay, las solicitudes urgentes o nuevas." },
        { titulo: "Pedir datos al cliente", texto: "Dentro de la solicitud, el bloque «Pedir datos al cliente» deja el correo o WhatsApp ya escrito y registra el contacto." },
        { titulo: "Cotizar", texto: "Abre la solicitud y entra a «Cotización y versiones»." },
      ],
    };
  }
  return {
    titulo: "Panel Travel Online",
    tips: [
      { titulo: "Solicitudes y cotizaciones", texto: "Todo parte en «Solicitudes»: ahí se atiende al cliente, se cotiza, se envía y se hace el seguimiento." },
      { titulo: "¿No encuentras un botón?", texto: "Pregúntale a tu asistente de la app, o escríbele a Julio con lo que necesitas." },
    ],
  };
}

export function AyudaPanel({ path, userName, onClose }: { path: string; userName: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { titulo, tips } = consejos(path);
  const asunto = "Panel Travel Online: necesito algo";
  const cuerpo = `Hola Julio,\n\nNecesito: \n\n(Pantalla: ${path})\n(Usuario: ${userName})\n`;
  const mailto = CORREO_SOPORTE && `mailto:${CORREO_SOPORTE}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Ayuda" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Ayuda</h2>
            <p className="text-[12.5px] text-[color:var(--muted)]">{titulo}</p>
          </div>
          <button type="button" className="crm-btn" onClick={onClose} aria-label="Cerrar">Cerrar ✕</button>
        </div>
        <ul className="mt-3 space-y-2 text-[13px]">
          {tips.map((t) => (
            <li key={t.titulo} className="border-b border-[var(--border)] pb-2">
              <b>{t.titulo}.</b> {t.texto}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <a className="crm-btn primary" href={ASISTENTE_URL} target="_blank" rel="noreferrer">Preguntarle al asistente</a>
          {mailto && <a className="crm-btn" href={mailto}>¿Falta una función? Escribirle a Julio</a>}
        </div>
        <p className="mt-2 text-[12px] text-[color:var(--muted)]">Escríbele a Julio a cualquier hora: te responde lo antes posible y agrega lo que haga falta.</p>
      </div>
    </div>
  );
}
