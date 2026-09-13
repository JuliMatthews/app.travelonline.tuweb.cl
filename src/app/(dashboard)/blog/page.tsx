import Link from "next/link";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listBlogPosts } from "@/lib/blog-repo";

export default async function BlogPage() {
  const session = await getSession();
  const posts = await listBlogPosts();
  const canCreate = can(session?.user, "blog:create");

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-brand-dark">Blog</h1>
        {canCreate && (
          <Link
            href="/blog/nuevo"
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Nuevo post
          </Link>
        )}
      </div>

      <div className="mt-6 space-y-2">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/blog/${post.id}/editar`}
            className="flex items-center justify-between rounded-xl border border-black/10 bg-white p-4 hover:bg-brand-light/30"
          >
            <div>
              <p className="font-medium text-brand-dark">{post.title}</p>
              <p className="text-xs text-foreground/50">/{post.slug}</p>
            </div>
            <span className="rounded-full bg-brand-light px-2 py-1 text-xs text-brand-dark">
              {post.status === "published" ? "Publicado" : "Borrador"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
