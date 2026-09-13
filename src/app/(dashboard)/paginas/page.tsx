import Link from "next/link";
import { listStaticPages } from "@/lib/pages-repo";

export default async function PaginasPage() {
  const pages = await listStaticPages();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-brand-dark">Páginas</h1>
      <div className="mt-6 space-y-2">
        {pages.map((p) => (
          <Link
            key={p.id}
            href={`/paginas/${p.slug}`}
            className="block rounded-xl border border-black/10 bg-white p-4 hover:bg-brand-light/30"
          >
            <p className="font-medium text-brand-dark">{p.title}</p>
            <p className="text-xs text-foreground/50">
              /{p.slug} — actualizado {new Date(p.updatedAt).toLocaleString("es-CL")}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
