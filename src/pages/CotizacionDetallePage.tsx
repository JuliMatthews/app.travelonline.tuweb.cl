import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import { QuoteDetailForm } from "@/components/QuoteDetailForm";
import type { QuoteDetail } from "@/lib/types";

type QuoteUser = { id: string; name: string };

export default function CotizacionDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [users, setUsers] = useState<QuoteUser[]>([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiGet<{ quote: QuoteDetail }>(`/api-quotes.php?action=get&id=${id}`).then((res) => {
      if (res.ok) setQuote(res.quote);
      else setNotFound(true);
    });
    apiGet<{ users: QuoteUser[] }>("/api-quotes.php?action=users").then((res) => {
      if (res.ok) setUsers(res.users);
    });
  }, [id]);

  if (notFound) return <p className="text-foreground/60">Cotización no encontrada.</p>;
  if (!quote) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">
        Cotización #{quote.id} — {quote.passengerName}
      </h1>
      <div className="mt-6">
        <QuoteDetailForm quote={quote} users={users} canEdit={can(user, "quotes:edit")} />
      </div>
    </div>
  );
}
