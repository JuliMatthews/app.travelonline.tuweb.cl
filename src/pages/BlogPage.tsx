import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import type { BlogPostSummary } from "@/lib/types";

export default function BlogPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<BlogPostSummary[]>([]);

  useEffect(() => {
    apiGet<{ posts: BlogPostSummary[] }>("/api-blog.php?action=list").then((res) => {
      if (res.ok) setPosts(res.posts);
    });
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-dark">Blog</h1>
        {can(user, "blog:create") && (
          <Link
            to="/blog/nuevo"
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
            to={`/blog/${post.id}/editar`}
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 hover:bg-brand-light/30"
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
