import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "@/lib/api";

type PageRow = { id: string; slug: string; title: string; updated_at: string };

export default function PaginasPage() {
  const [pages, setPages] = useState<PageRow[]>([]);

  useEffect(() => {
    apiGet<{ pages: PageRow[] }>("/api-pages.php?action=list").then((res) => {
      if (res.ok) setPages(res.pages);
    });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Páginas</h1>
      <div className="mt-6 space-y-2">
        {pages.map((p) => (
          <Link
            key={p.id}
            to={`/paginas/${p.slug}`}
            className="block rounded-xl border border-border bg-surface p-4 hover:bg-brand-light/30"
          >
            <p className="font-medium text-brand-dark">{p.title}</p>
            <p className="text-xs text-foreground/50">
              /{p.slug} — actualizado {new Date(p.updated_at).toLocaleString("es-CL")}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
