"use server";

import { z } from "zod";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { updateQuote } from "@/lib/quotes-repo";

const UpdateQuoteSchema = z.object({
  status: z.enum(["nueva", "en_proceso", "ganada", "perdida"]),
  internalNotes: z.string(),
  assignedTo: z.string().uuid().nullable(),
});

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function updateQuoteAction(id: number, raw: unknown): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !can(session.user, "quotes:edit")) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = UpdateQuoteSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Datos inválidos" };
  }

  await updateQuote(id, parsed.data);
  return { ok: true };
}
