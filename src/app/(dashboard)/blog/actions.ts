"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { createBlogPost, deleteBlogPost, updateBlogPost } from "@/lib/blog-repo";
import type { BlogPostInput } from "@/lib/types";

const InputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones"),
  title: z.string().min(1),
  excerpt: z.string(),
  content: z.string(),
  status: z.enum(["draft", "published"]),
  publishedAt: z.string().nullable(),
  featuredImageId: z.string().uuid().nullable(),
});

export type ActionResult = { ok: true; id: string } | { ok: false; message: string };

export async function saveBlogPostAction(
  existingId: string | null,
  raw: BlogPostInput
): Promise<ActionResult> {
  const session = await getSession();
  const action = existingId ? "blog:edit" : "blog:create";
  if (!session || !can(session.user, action)) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    if (existingId) {
      await updateBlogPost(existingId, parsed.data, session.user.id);
      return { ok: true, id: existingId };
    }
    const id = await createBlogPost(parsed.data, session.user.id);
    return { ok: true, id };
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      return { ok: false, message: "Ya existe un post con ese slug" };
    }
    throw err;
  }
}

export async function deleteBlogPostAction(id: string): Promise<void> {
  const session = await getSession();
  if (!session || !can(session.user, "blog:delete")) {
    throw new Error("No autorizado");
  }
  await deleteBlogPost(id);
  redirect("/blog");
}
