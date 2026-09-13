"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { createPackage, deletePackage, updatePackage } from "@/lib/packages-repo";
import type { PackageInput } from "@/lib/types";

const PackageInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones"),
  title: z.string().min(1),
  subtitle: z.string(),
  content: z.string(),
  durationDays: z.number().int().nullable(),
  durationNights: z.number().int().nullable(),
  packageType: z.enum(["circuito", "todo_incluido", "combinado", "promocion_2x1"]),
  priceDisplayMode: z.enum(["desde", "bajo_consulta", "rango"]),
  priceFromClp: z.number().int().nullable(),
  priceToClp: z.number().int().nullable(),
  priceUnit: z.enum(["per_person", "per_couple"]),
  included: z.string(),
  notIncluded: z.string(),
  regionId: z.string().uuid().nullable(),
  isFeatured: z.boolean(),
  featuredSortOrder: z.number().int().nullable(),
  showInPromociones: z.boolean(),
  status: z.enum(["draft", "published", "archived"]),
  addons: z.array(z.object({ name: z.string().min(1), priceClp: z.number().int() })),
  roomOptions: z.array(
    z.object({ label: z.string().min(1), priceAdjustmentClp: z.number().int() })
  ),
  itinerary: z.array(
    z.object({
      dayNumber: z.number().int().nullable(),
      title: z.string(),
      description: z.string(),
    })
  ),
  imageIds: z.array(z.string().uuid()),
});

export type ActionResult = { ok: true; id: string } | { ok: false; message: string };

export async function savePackageAction(
  existingId: string | null,
  raw: PackageInput
): Promise<ActionResult> {
  const session = await getSession();
  const action = existingId ? "packages:edit" : "packages:create";
  if (!session || !can(session.user, action)) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = PackageInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    if (existingId) {
      await updatePackage(existingId, parsed.data, session.user.id);
      return { ok: true, id: existingId };
    }
    const id = await createPackage(parsed.data, session.user.id);
    return { ok: true, id };
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      return { ok: false, message: "Ya existe un paquete con ese slug" };
    }
    throw err;
  }
}

export async function deletePackageAction(id: string): Promise<void> {
  const session = await getSession();
  if (!session || !can(session.user, "packages:delete")) {
    throw new Error("No autorizado");
  }
  await deletePackage(id);
  redirect("/paquetes");
}
