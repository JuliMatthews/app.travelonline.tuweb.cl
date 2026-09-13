import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getStaticPageBySlug } from "@/lib/pages-repo";
import { StaticPageForm } from "@/components/StaticPageForm";

export default async function EditarPaginaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSession();
  if (!can(session?.user, "pages:view")) {
    redirect("/");
  }

  const page = await getStaticPageBySlug(slug);
  if (!page) notFound();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-brand-dark">{page.title}</h1>
      <div className="mt-6">
        <StaticPageForm page={page} canEdit={can(session?.user, "pages:edit")} />
      </div>
    </div>
  );
}
