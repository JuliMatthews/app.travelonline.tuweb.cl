import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getBlogPostById } from "@/lib/blog-repo";
import { BlogForm } from "@/components/BlogForm";

export default async function EditarPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!can(session?.user, "blog:view")) {
    redirect("/blog");
  }

  const post = await getBlogPostById(id);
  if (!post) notFound();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-brand-dark">{post.title}</h1>
      <div className="mt-6">
        <BlogForm
          existing={post}
          canEdit={can(session?.user, "blog:edit")}
          canDelete={can(session?.user, "blog:delete")}
        />
      </div>
    </div>
  );
}
