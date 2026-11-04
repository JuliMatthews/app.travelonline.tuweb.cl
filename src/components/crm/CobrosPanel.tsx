import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { clp } from "@/lib/crm";

type Payment = {
  id: number; concept: string; amountClp: number; method: "webpay" | "transferencia" | "efectivo" | "otro"; payUrl: string | null;
  status: "pendiente" | "pagado" | "anulado"; dueDate: string | null; paidAt: string | null; reference: string | null; createdBy: string | null; overdue: boolean;
};
const METHOD: Record<Payment["method"], string> = { webpay: "Webpay", transferencia: "Transferencia", efectivo: "Efectivo", otro: "Otro" };
const STATUS: Record<Payment["status"], { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-amber-100 text-amber-900" },
  pagado: { label: "Pagado", cls: "bg-emerald-100 text-emerald-900" },
  anulado: { label: "Anulado", cls: "bg-foreground/10 text-foreground/50" },
};
const shortDate = (iso: string) => new Date(iso.length > 10 ? iso.replace(" ", "T") : `${iso}T12:00:00`).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });

// Cobros de una solicitud: anticipo, saldo o un monto fijo. El link de pago (p. ej. Webpay) se genera fuera del
// sistema y se pega aquí; este panel lleva el seguimiento y arma el mensaje de WhatsApp.
export function CobrosPanel({ quoteId, passengerName, phone, canEdit, saleAmountClp }: { quoteId: number; passengerName: string; phone: string | null; canEdit: boolean; saleAmountClp: number | null }) {
  const [rows, setRows] = useState<Payment[]>([]);
  const [totals, setTotals] = useState({ paid: 0, pending: 0 });
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ concept: "", amount: "", method: "webpay" as Payment["method"], payUrl: "", dueDate: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<{ payments: Payment[]; paidClp: number; pendingClp: number }>(`/api-payments.php?action=list&quoteId=${quoteId}`).then((r) => {
      if (r.ok) { setRows(r.payments); setTotals({ paid: r.paidClp, pending: r.pendingClp }); }
    });
  }, [quoteId]);
  useEffect(load, [load]);

  async function create() {
    setBusy(true); setErr(null);
    const res = await apiPost("/api-payments.php?action=create", { quoteId, concept: f.concept, amountClp: Number(f.amount.replace(/\D/g, "")), method: f.method, payUrl: f.payUrl, dueDate: f.dueDate });
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setF({ concept: "", amount: "", method: "webpay", payUrl: "", dueDate: "" });
    setAdding(false);
    load();
  }
  async function setStatus(p: Payment, status: Payment["status"]) {
    let reference = "";
    if (status === "pagado") { const r = window.prompt("Número de autorización o comprobante (opcional):", ""); if (r === null) return; reference = r; }
    if (status === "anulado" && !window.confirm(`¿Anular el cobro «${p.concept}» de ${clp(p.amountClp)}?`)) return;
    setBusy(true);
    await apiPost("/api-payments.php?action=status", { id: p.id, status, reference });
    setBusy(false);
    load();
  }
  function wspLink(p: Payment) {
    const digits = (phone ?? "").replace(/\D/g, "");
    if (!digits) return null;
    const first = passengerName.split(" ")[0];
    const how = p.payUrl ? `Puedes pagarlo aquí: ${p.payUrl}` : p.method === "transferencia" ? "Te envío los datos para la transferencia por este medio." : "Coordinemos el pago por este medio.";
    return `https://wa.me/${digits}?text=${encodeURIComponent(`Hola ${first}, te escribe Travel Online. Te comparto el cobro «${p.concept}» por ${clp(p.amountClp)}${p.dueDate ? ` (hasta el ${shortDate(p.dueDate)})` : ""}. ${how}`)}`;
  }

  return (
    <>
      <div className="crm-section">Cobros</div>
      <div className="text-[12.5px] text-[color:var(--muted)]">
        Pagado <b className="text-[color:var(--ok)]">{clp(totals.paid)}</b> · Pendiente <b>{clp(totals.pending)}</b>
        {saleAmountClp ? <> · Venta {clp(saleAmountClp)} {totals.paid >= saleAmountClp ? "· ✓ pagada completa" : `· faltan ${clp(Math.max(saleAmountClp - totals.paid, 0))}`}</> : null}
      </div>
      {rows.length === 0 && !adding && <p className="mt-2 text-[12.5px] text-[color:var(--muted)]">Todavía no hay cobros en esta solicitud.</p>}
      <ul className="mt-2 space-y-2">
        {rows.map((p) => (
          <li key={p.id} className={`rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] ${p.status === "anulado" ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <b>{p.concept}</b>
              <span className="font-bold">{clp(p.amountClp)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
              {p.overdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-900">vencido</span>}
              <span className="text-[12px] text-[color:var(--muted)]">{METHOD[p.method]}{p.dueDate && p.status === "pendiente" ? ` · hasta ${shortDate(p.dueDate)}` : ""}{p.paidAt ? ` · pagado el ${shortDate(p.paidAt)}` : ""}{p.reference ? ` · ref. ${p.reference}` : ""}</span>
            </div>
            {canEdit && p.status === "pendiente" && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {wspLink(p) && <a className="crm-btn" href={wspLink(p)!} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>}
                {p.payUrl && <button type="button" className="crm-btn" onClick={() => navigator.clipboard?.writeText(p.payUrl!)}>Copiar link</button>}
                <button type="button" className="crm-btn primary" disabled={busy} onClick={() => setStatus(p, "pagado")}>Marcar pagado</button>
                <button type="button" className="text-[12px] font-semibold text-red-700 hover:underline" disabled={busy} onClick={() => setStatus(p, "anulado")}>Anular</button>
              </div>
            )}
            {canEdit && p.status !== "pendiente" && (
              <button type="button" className="mt-1 text-[12px] font-semibold text-[color:var(--muted)] hover:underline" disabled={busy} onClick={() => setStatus(p, "pendiente")}>Volver a pendiente</button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && !adding && <button type="button" className="crm-btn mt-2" onClick={() => setAdding(true)}>+ Nuevo cobro</button>}
      {canEdit && adding && (
        <div className="mt-2 grid gap-2 rounded-lg border border-dashed border-[var(--border)] p-3 md:grid-cols-2">
          <label className="text-[12.5px] font-semibold">Concepto<input className="crm-field" placeholder="Anticipo, saldo…" value={f.concept} onChange={(e) => setF({ ...f, concept: e.target.value })} /></label>
          <label className="text-[12.5px] font-semibold">Monto (CLP)<input className="crm-field" inputMode="numeric" placeholder="100000" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
          <label className="text-[12.5px] font-semibold">Cómo paga
            <select className="crm-field" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as Payment["method"] })}>
              {Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-[12.5px] font-semibold">Pagar hasta (opcional)<input className="crm-field" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
          <label className="text-[12.5px] font-semibold md:col-span-2">Link de pago (opcional, empieza con https://)<input className="crm-field" value={f.payUrl} onChange={(e) => setF({ ...f, payUrl: e.target.value })} /></label>
          {err && <p className="rounded-lg bg-[var(--rosa-050)] px-3 py-2 text-[12.5px] font-semibold text-[color:var(--risk)] md:col-span-2">{err}</p>}
          <div className="flex justify-end gap-2 md:col-span-2">
            <button type="button" className="crm-btn" onClick={() => { setAdding(false); setErr(null); }}>Cancelar</button>
            <button type="button" className="crm-btn primary" disabled={busy || !f.concept.trim() || !f.amount.trim()} onClick={create}>Guardar cobro</button>
          </div>
        </div>
      )}
    </>
  );
}
