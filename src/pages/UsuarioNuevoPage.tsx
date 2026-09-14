import { Navigate } from "react-router-dom";
import { useAuth, can } from "@/contexts/AuthContext";
import { NewUserForm } from "@/components/NewUserForm";

export default function UsuarioNuevoPage() {
  const { user } = useAuth();
  if (!can(user, "users:manage")) return <Navigate to="/" replace />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Nuevo usuario</h1>
      <div className="mt-6">
        <NewUserForm />
      </div>
    </div>
  );
}
