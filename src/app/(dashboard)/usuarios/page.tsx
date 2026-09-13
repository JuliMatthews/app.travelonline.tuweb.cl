import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listUsers } from "@/lib/users-repo";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  admin_viewer: "Admin (solo ver)",
  editor: "Editor",
};

export default async function UsuariosPage() {
  const session = await getSession();
  if (!can(session?.user, "users:manage")) {
    redirect("/");
  }

  const users = await listUsers();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-brand-dark">Usuarios</h1>
        <Link
          href="/usuarios/nuevo"
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Nuevo usuario
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-black/10 text-left text-foreground/60">
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
              <tr key={u.id} className="border-b border-black/5 last:border-0 hover:bg-brand-light/30">
                <td className="px-4 py-3">
                  <Link href={`/usuarios/${u.id}`} className="font-medium text-brand-dark hover:underline">
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
