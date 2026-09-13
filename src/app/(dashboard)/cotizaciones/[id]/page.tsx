import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getQuoteById } from "@/lib/quotes-repo";
import { listUsers } from "@/lib/users-repo";
import { QuoteDetailForm } from "@/components/QuoteDetailForm";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  const [quote, users] = await Promise.all([getQuoteById(Number(id)), listUsers()]);
  if (!quote) notFound();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-brand-dark">
        Cotización #{quote.id} — {quote.passengerName}
      </h1>
      <div className="mt-6">
        <QuoteDetailForm quote={quote} users={users} canEdit={can(session?.user, "quotes:edit")} />
      </div>
    </div>
  );
}
