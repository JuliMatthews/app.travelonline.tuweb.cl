import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { BlogForm } from "@/components/BlogForm";

export default async function NuevoPostPage() {
  const session = await getSession();
  if (!can(session?.user, "blog:create")) {
    redirect("/blog");
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-brand-dark">Nuevo post</h1>
      <div className="mt-6">
        <BlogForm existing={null} canEdit canDelete={false} />
      </div>
    </div>
  );
}
