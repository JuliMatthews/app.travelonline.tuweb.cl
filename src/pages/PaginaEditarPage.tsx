import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import { StaticPageForm } from "@/components/StaticPageForm";
import type { StaticPage } from "@/lib/types";

export default function PaginaEditarPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [page, setPage] = useState<StaticPage | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    apiGet<{ page: StaticPage }>(`/api-pages.php?action=get&slug=${slug}`).then((res) => {
      if (res.ok) setPage(res.page);
      else setNotFound(true);
    });
  }, [slug]);

  if (notFound) return <p className="text-foreground/60">Página no encontrada.</p>;
  if (!page) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">{page.title}</h1>
      <div className="mt-6">
        <StaticPageForm page={page} canEdit={can(user, "pages:edit")} />
      </div>
    </div>
  );
}
