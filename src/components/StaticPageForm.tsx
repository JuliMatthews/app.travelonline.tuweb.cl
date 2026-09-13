"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StaticPage } from "@/lib/types";
import { updateStaticPageAction } from "@/app/(dashboard)/paginas/actions";

export function StaticPageForm({ page, canEdit }: { page: StaticPage; canEdit: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await updateStaticPageAction(page.slug, { title, content });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-4">
      <label className="block">
        <span className="block text-sm font-medium text-brand-dark">Título</span>
        <input
          disabled={!canEdit}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input mt-1"
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium text-brand-dark">
          Contenido (HTML) — se preserva tal cual, incluyendo las clases de estilo
        </span>
        <textarea
          disabled={!canEdit}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={20}
          className="input mt-1 font-mono text-xs"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {canEdit && (
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-brand px-6 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
      )}
    </form>
  );
}
