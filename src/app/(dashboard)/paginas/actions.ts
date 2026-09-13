"use server";

import { z } from "zod";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { updateStaticPage } from "@/lib/pages-repo";

const InputSchema = z.object({
  title: z.string().min(1),
  content: z.string(),
});

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function updateStaticPageAction(slug: string, raw: unknown): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !can(session.user, "pages:edit")) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Datos inválidos" };
  }

  await updateStaticPage(slug, parsed.data, session.user.id);
  return { ok: true };
}
