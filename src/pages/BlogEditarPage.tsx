import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import { BlogForm } from "@/components/BlogForm";
import type { BlogPostDetail } from "@/lib/types";

export default function BlogEditarPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [post, setPost] = useState<BlogPostDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiGet<{ post: BlogPostDetail }>(`/api-blog.php?action=get&id=${id}`).then((res) => {
      if (res.ok) setPost(res.post);
      else setNotFound(true);
    });
  }, [id]);

  if (!can(user, "blog:view")) return <Navigate to="/blog" replace />;
  if (notFound) return <p className="text-foreground/60">Post no encontrado.</p>;
  if (!post) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">{post.title}</h1>
      <div className="mt-6">
        <BlogForm existing={post} canEdit={can(user, "blog:edit")} canDelete={can(user, "blog:delete")} />
      </div>
    </div>
  );
}
