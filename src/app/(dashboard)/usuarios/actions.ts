"use server";

import { z } from "zod";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { createUser, updateUser } from "@/lib/users-repo";

const RoleSchema = z.enum(["super_admin", "admin_viewer", "editor"]);

const CreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Mínimo 8 caracteres"),
  name: z.string().min(1),
  role: RoleSchema,
});

const UpdateSchema = z.object({
  name: z.string().min(1),
  role: RoleSchema,
  isActive: z.boolean(),
  newPassword: z.string(),
});

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function createUserAction(raw: unknown): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !can(session.user, "users:manage")) {
    return { ok: false, message: "No autorizado" };
  }
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  try {
    await createUser(parsed.data);
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      return { ok: false, message: "Ya existe una cuenta con ese correo" };
    }
    throw err;
  }
}

export async function updateUserAction(id: string, raw: unknown): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !can(session.user, "users:manage")) {
    return { ok: false, message: "No autorizado" };
  }
  if (id === session.user.id && (raw as { isActive?: boolean })?.isActive === false) {
    return { ok: false, message: "No puedes desactivar tu propia cuenta" };
  }
  const parsed = UpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  await updateUser(id, parsed.data);
  return { ok: true };
}
