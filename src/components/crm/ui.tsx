import { ALERT_LABEL, CHANNEL_LABEL, STATUS_LABEL, channelVar, statusVar } from "@/lib/crm";
import type { QuoteAlert, QuoteChannel, QuoteStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <span className="crm-badge" style={{ "--c": statusVar(status) } as React.CSSProperties}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function ChannelBadge({ channel }: { channel: QuoteChannel }) {
  return (
    <span className="crm-badge" style={{ "--c": channelVar(channel) } as React.CSSProperties}>
      {CHANNEL_LABEL[channel] ?? channel}
    </span>
  );
}

export function AlertDot({ alert, days }: { alert: QuoteAlert; days?: number }) {
  const title = ALERT_LABEL[alert] + (days != null && alert !== "cerrado" ? ` (${days} días)` : "");
  return <span className={`crm-dot ${alert}`} title={title} aria-label={title} role="img" />;
}

/** Barra horizontal: nombre · pista · valor (gráficos de distribución). */
export function HBar({ label, value, max, color }: { label: string; value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="crm-hbar">
      <span className="nom" title={label}>
        {label}
      </span>
      <span className="pista">
        <i style={{ width: `${w}%`, background: color ?? "var(--mar)" }} />
      </span>
      <span className="val">{value}</span>
    </div>
  );
}

export function Kpi({
  label,
  value,
  note,
  tone,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  tone?: "acento" | "ok" | "riesgo" | "mar";
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={`crm-kpi ${tone ?? ""}`}>
      <div className="et">{label}</div>
      <div className="va">{value}</div>
      {note && <div className="nota">{note}</div>}
    </Tag>
  );
}
