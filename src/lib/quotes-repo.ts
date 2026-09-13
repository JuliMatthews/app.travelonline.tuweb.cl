import { pool } from "@/lib/db";
import type { QuoteDetail, QuoteStatus, QuoteSummary } from "@/lib/types";

export async function listQuotes(): Promise<QuoteSummary[]> {
  const { rows } = await pool.query(`
    SELECT
      q.id, q.created_at, q.package_slug, q.package_title,
      q.passenger_name, q.passenger_email, q.total_clp, q.status,
      u.name AS assigned_to_name
    FROM quote_requests q
    LEFT JOIN users u ON u.id = q.assigned_to
    ORDER BY q.created_at DESC
  `);

  return rows.map((row) => ({
    id: row.id,
    createdAt: (row.created_at as Date).toISOString(),
    packageSlug: row.package_slug,
    packageTitle: row.package_title,
    passengerName: row.passenger_name,
    passengerEmail: row.passenger_email,
    totalClp: row.total_clp,
    status: row.status,
    assignedToName: row.assigned_to_name,
  }));
}

export async function getQuoteById(id: number): Promise<QuoteDetail | null> {
  const { rows } = await pool.query(
    `
    SELECT q.*, u.name AS assigned_to_name
    FROM quote_requests q
    LEFT JOIN users u ON u.id = q.assigned_to
    WHERE q.id = $1
    `,
    [id]
  );
  if (rows.length === 0) return null;
  const row = rows[0];

  return {
    id: row.id,
    createdAt: (row.created_at as Date).toISOString(),
    packageSlug: row.package_slug,
    packageTitle: row.package_title,
    passengerName: row.passenger_name,
    passengerEmail: row.passenger_email,
    totalClp: row.total_clp,
    status: row.status,
    assignedToName: row.assigned_to_name,
    adults: row.adults,
    children: row.children,
    roomOptionLabel: row.room_option_label,
    selectedAddons: row.selected_addons_json ?? [],
    perPersonBaseClp: row.per_person_base_clp,
    passengersSubtotalClp: row.passengers_subtotal_clp,
    addonsTotalClp: row.addons_total_clp,
    roomAdjustmentClp: row.room_adjustment_clp,
    depositSuggestedClp: row.deposit_suggested_clp,
    preferredDateFrom: row.preferred_date_from
      ? new Date(row.preferred_date_from).toISOString().slice(0, 10)
      : null,
    preferredDateTo: row.preferred_date_to
      ? new Date(row.preferred_date_to).toISOString().slice(0, 10)
      : null,
    passengerPhone: row.passenger_phone,
    comments: row.comments,
    internalNotes: row.internal_notes,
    assignedTo: row.assigned_to,
  };
}

export async function updateQuote(
  id: number,
  input: { status: QuoteStatus; internalNotes: string; assignedTo: string | null }
): Promise<void> {
  await pool.query(
    `UPDATE quote_requests SET status = $1, internal_notes = $2, assigned_to = $3, updated_at = now()
     WHERE id = $4`,
    [input.status, input.internalNotes || null, input.assignedTo, id]
  );
}
