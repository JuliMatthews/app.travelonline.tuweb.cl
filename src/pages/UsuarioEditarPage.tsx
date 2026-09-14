import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import { EditUserForm } from "@/components/EditUserForm";
import type { UserRow } from "@/lib/types";

export default function UsuarioEditarPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [target, setTarget] = useState<UserRow | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiGet<{ user: UserRow }>(`/api-users.php?action=get&id=${id}`).then((res) => {
      if (res.ok) setTarget(res.user);
      else setNotFound(true);
    });
  }, [id]);

  if (!can(user, "users:manage")) return <Navigate to="/" replace />;
  if (notFound) return <p className="text-foreground/60">Usuario no encontrado.</p>;
  if (!target) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">{target.name}</h1>
      <div className="mt-6">
        <EditUserForm user={target} isSelf={user?.id === target.id} />
      </div>
    </div>
  );
}
