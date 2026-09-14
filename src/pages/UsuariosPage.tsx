import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import type { UserRow } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  admin_viewer: "Admin (solo ver)",
  editor: "Editor",
};

export default function UsuariosPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);

  useEffect(() => {
    apiGet<{ users: UserRow[] }>("/api-users.php?action=list").then((res) => {
      if (res.ok) setUsers(res.users);
    });
  }, []);

  if (!can(user, "users:manage")) return <Navigate to="/" replace />;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-dark">Usuarios</h1>
        <Link
          to="/usuarios/nuevo"
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Nuevo usuario
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-foreground/60">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Último ingreso</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0 hover:bg-brand-light/30">
                <td className="px-4 py-3">
                  <Link to={`/usuarios/${u.id}`} className="font-medium text-brand-dark hover:underline">
                    {u.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-foreground/70">{u.email}</td>
                <td className="px-4 py-3 text-foreground/70">{ROLE_LABEL[u.role] ?? u.role}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      u.isActive ? "bg-brand-light text-brand-dark" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {u.isActive ? "Activo" : "Desactivado"}
                  </span>
                </td>
                <td className="px-4 py-3 text-foreground/70">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("es-CL") : "Nunca"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
