import { Navigate } from "react-router-dom";
import { useAuth, can } from "@/contexts/AuthContext";
import { BlogForm } from "@/components/BlogForm";

export default function BlogNuevoPage() {
  const { user } = useAuth();
  if (!can(user, "blog:create")) return <Navigate to="/blog" replace />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Nuevo post</h1>
      <div className="mt-6">
        <BlogForm existing={null} canEdit canDelete={false} />
      </div>
    </div>
  );
}
