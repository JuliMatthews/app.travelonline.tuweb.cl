import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { BRAND_LABEL, clp, fecha, fechaLarga } from "@/lib/crm";
import type { QuotationPrint } from "@/lib/types";

// Hoja imprimible de UNA versión de la cotización. "Guardar como PDF" en el diálogo de
// impresión del navegador (gratis, sin librerías). Muestra la marca de la solicitud.
export default function CotizacionPdfPage() {
  const { versionId } = useParams<{ versionId: string }>();
  const [data, setData] = useState<QuotationPrint | null | undefined>(undefined);

  useEffect(() => {
    apiGet<QuotationPrint>(`/api-quotations.php?action=print&versionId=${versionId}`).then((res) => setData(res.ok ? res : null));
  }, [versionId]);

  if (data === undefined) return <p style={{ padding: 24 }}>Cargando…</p>;
  if (data === null) return <p style={{ padding: 24 }}>No se pudo cargar la cotización (¿iniciaste sesión?).</p>;

  const { version: v, request: r } = data;
  const subtotal = v.lines.reduce((a, l) => a + l.amountClp, 0);
  const items = (t: string | null) => (t ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  const label = v.version <= 1 ? String(v.number) : `${v.number}.${v.version - 1}`;

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: 32, fontFamily: "system-ui, sans-serif", color: "#1b2433", background: "#fff", minHeight: "100vh" }}>
      <style>{`@media print { .no-print { display: none !important } body { background: #fff } }`}</style>
      <button className="no-print" onClick={() => window.print()} style={{ float: "right", padding: "8px 14px", borderRadius: 8, border: "1px solid #2d4874", background: "#2d4874", color: "#fff", cursor: "pointer" }}>
        Imprimir / Guardar PDF
      </button>
      <h1 style={{ margin: 0, color: "#2d4874" }}>{BRAND_LABEL[r.brand]}</h1>
      <p style={{ margin: "4px 0 20px", color: "#6b7385" }}>
        Cotización N° {label} · {r.folio ?? ""} · {fechaLarga(v.sentAt ?? v.createdAt)}
        {v.status === "borrador" && " · BORRADOR"}
      </p>
      <p style={{ margin: 0 }}>Para: <b>{r.passengerName}</b></p>
      <h2 style={{ marginBottom: 2 }}>{v.title}</h2>
      {v.subtitle && <p style={{ margin: 0, color: "#6b7385" }}>{v.subtitle}</p>}
      <p style={{ color: "#6b7385" }}>{v.pax} pasajero{v.pax === 1 ? "" : "s"}</p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <tbody>
          {v.lines.map((l, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #e3e7ee" }}>
              <td style={{ padding: "10px 0" }}><b>{l.title}</b>{l.detail && <div style={{ color: "#6b7385", fontSize: 13 }}>{l.detail}</div>}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{clp(l.amountClp)}</td>
            </tr>
          ))}
          {v.discountClp > 0 && (
            <>
              <tr><td style={{ padding: "8px 0", color: "#6b7385" }}>Subtotal</td><td style={{ textAlign: "right" }}>{clp(subtotal)}</td></tr>
              <tr><td style={{ padding: "4px 0" }}>{v.discountLabel || "Descuento"}</td><td style={{ textAlign: "right" }}>− {clp(v.discountClp)}</td></tr>
            </>
          )}
          <tr><td style={{ padding: "12px 0", fontSize: 18 }}><b>Total</b></td><td style={{ textAlign: "right", fontSize: 18 }}><b>{clp(v.totalClp)}</b></td></tr>
        </tbody>
      </table>
      <p style={{ color: "#6b7385" }}>{clp(Math.round(v.totalClp / Math.max(1, v.pax)))} por persona</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 20 }}>
        <div><h3>Incluye</h3><ul>{items(v.includesText).map((t, i) => <li key={i}>{t}</li>)}</ul></div>
        <div><h3>No incluye</h3><ul>{items(v.excludesText).map((t, i) => <li key={i}>{t}</li>)}</ul></div>
      </div>
      {v.validUntil && <p style={{ marginTop: 24, fontWeight: 600 }}>Cotización válida hasta el {fecha(v.validUntil)}. Los valores pueden variar según disponibilidad al confirmar.</p>}
    </div>
  );
}
