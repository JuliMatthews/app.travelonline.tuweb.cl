"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { BlogPostDetail, BlogPostInput } from "@/lib/types";
import { saveBlogPostAction, deleteBlogPostAction } from "@/app/(dashboard)/blog/actions";

function emptyInput(): BlogPostInput {
  return {
    slug: "",
    title: "",
    excerpt: "",
    content: "",
    status: "draft",
    publishedAt: null,
    featuredImageId: null,
  };
}

function fromDetail(post: BlogPostDetail): BlogPostInput {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    status: post.status,
    publishedAt: post.publishedAt,
    featuredImageId: post.featuredImage?.id ?? null,
  };
}

export function BlogForm({
  existing,
  canEdit,
  canDelete,
}: {
  existing: BlogPostDetail | null;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<BlogPostInput>(existing ? fromDetail(existing) : emptyInput());
  const [image, setImage] = useState(existing?.featuredImage ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof BlogPostInput>(key: K, value: BlogPostInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? "No se pudo subir la imagen");
      }
      const data = (await res.json()) as { id: string; extension: string };
      setImage({ id: data.id, extension: data.extension, altText: null, sortOrder: 0 });
      update("featuredImageId", data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado subiendo la imagen");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      publishedAt:
        form.status === "published" ? form.publishedAt ?? new Date().toISOString() : form.publishedAt,
    };
    const result = await saveBlogPostAction(existing?.id ?? null, payload);
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push("/blog");
    router.refresh();
  }

  async function handleDelete() {
    if (!existing) return;
    if (!confirm(`¿Eliminar "${existing.title}"? No se puede deshacer.`)) return;
    await deleteBlogPostAction(existing.id);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      <label className="block">
        <span className="block text-sm font-medium text-brand-dark">Título</span>
        <input
          required
          disabled={!canEdit}
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
          className="input mt-1"
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium text-brand-dark">Slug (URL)</span>
        <input
          required
          disabled={!canEdit}
          value={form.slug}
          onChange={(e) => update("slug", e.target.value)}
          className="input mt-1"
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium text-brand-dark">Extracto</span>
        <textarea
          disabled={!canEdit}
          value={form.excerpt}
          onChange={(e) => update("excerpt", e.target.value)}
          rows={2}
          className="input mt-1"
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium text-brand-dark">Contenido (HTML)</span>
        <textarea
          disabled={!canEdit}
          value={form.content}
          onChange={(e) => update("content", e.target.value)}
          rows={12}
          className="input mt-1 font-mono text-xs"
        />
      </label>

      <div>
        <span className="block text-sm font-medium text-brand-dark">Imagen destacada</span>
        {image && (
          <div className="relative mt-2 aspect-video w-64 overflow-hidden rounded-lg ring-1 ring-black/10">
            <Image src={`/uploads/${image.id}.${image.extension}`} alt="" fill sizes="256px" className="object-cover" />
          </div>
        )}
        {canEdit && (
          <label className="mt-2 inline-block cursor-pointer rounded-lg border border-dashed border-black/20 px-4 py-2 text-sm text-foreground/60 hover:bg-brand-light/30">
            {uploading ? "Subiendo..." : image ? "Cambiar imagen" : "Agregar imagen"}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
        )}
      </div>

      <label className="block">
        <span className="block text-sm font-medium text-brand-dark">Estado</span>
        <select
          disabled={!canEdit}
          value={form.status}
          onChange={(e) => update("status", e.target.value as BlogPostInput["status"])}
          className="input mt-1 max-w-xs"
        >
          <option value="draft">Borrador</option>
          <option value="published">Publicado</option>
        </select>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between border-t border-black/10 pt-6">
        {canEdit && (
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-brand px-6 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        )}
        {existing && canDelete && (
          <button type="button" onClick={handleDelete} className="text-sm text-red-600 hover:underline">
            Eliminar post
          </button>
        )}
      </div>
    </form>
  );
}
