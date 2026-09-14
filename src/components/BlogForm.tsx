import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost, apiUpload } from "@/lib/api";
import type { BlogPostDetail, BlogPostInput } from "@/lib/types";

type FeaturedImage = { id: string; extension: string };

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
  const navigate = useNavigate();
  const [form, setForm] = useState<BlogPostInput>(existing ? fromDetail(existing) : emptyInput());
  const [image, setImage] = useState<FeaturedImage | null>(
    existing?.featuredImage ? { id: existing.featuredImage.id, extension: existing.featuredImage.extension } : null
  );
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
    const result = await apiUpload<{ id: string; extension: string }>("/api-uploads.php", file);
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setImage({ id: result.id, extension: result.extension });
    update("featuredImageId", result.id);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      publishedAt: form.status === "published" ? form.publishedAt ?? new Date().toISOString() : form.publishedAt,
    };
    const action = existing
      ? `/api-blog.php?action=update&id=${existing.id}`
      : "/api-blog.php?action=create";
    const result = await apiPost<{ id: string }>(action, payload);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate("/blog");
  }

  async function handleDelete() {
    if (!existing) return;
    if (!confirm(`¿Eliminar "${existing.title}"? No se puede deshacer.`)) return;
    await apiPost(`/api-blog.php?action=delete&id=${existing.id}`, {});
    navigate("/blog");
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
          <div className="relative mt-2 aspect-video w-64 overflow-hidden rounded-lg ring-1 ring-border">
            <img
              src={`/uploads/${image.id}.${image.extension}`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        )}
        {canEdit && (
          <label className="mt-2 inline-block cursor-pointer rounded-lg border border-dashed border-border px-4 py-2 text-sm text-foreground/60 hover:bg-brand-light/30">
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

      <div className="flex items-center justify-between border-t border-border pt-6">
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
