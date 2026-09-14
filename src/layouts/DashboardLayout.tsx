import { Navigate, NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  MessageSquareText,
  FileText,
  Newspaper,
  Users,
  LogOut,
  Sun,
  Moon,
  Plane,
} from "lucide-react";
import { useAuth, can } from "@/contexts/AuthContext";
import { useTheme } from "@/lib/theme";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  admin_viewer: "Admin (solo ver)",
  editor: "Editor",
};

export default function DashboardLayout() {
  const { user, loading, logout } = useAuth();
  const { theme, toggle } = useTheme();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground/50">
        Cargando…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? "bg-brand text-white"
        : "text-foreground/70 hover:bg-surface-muted hover:text-foreground"
    }`;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-64 flex-col border-r border-border bg-surface p-4">
        <div className="flex items-center gap-2 px-2 py-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
            <Plane size={18} />
          </span>
          <div>
            <p className="font-bold leading-tight text-foreground">Travelonline</p>
            <p className="text-xs text-foreground/50">Panel de administración</p>
          </div>
        </div>

        <div className="mt-5 rounded-xl bg-surface-muted p-3">
          <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
          <p className="text-xs text-foreground/50">{ROLE_LABEL[user.role] ?? user.role}</p>
        </div>

        <nav className="mt-5 flex flex-col gap-1 text-sm">
          <NavLink to="/" end className={linkClass}>
            <LayoutDashboard size={18} /> Inicio
          </NavLink>
          <NavLink to="/cotizaciones" className={linkClass}>
            <MessageSquareText size={18} /> Cotizaciones
          </NavLink>
          <NavLink to="/paquetes" className={linkClass}>
            <Package size={18} /> Paquetes
          </NavLink>
          {can(user, "pages:view") && (
            <NavLink to="/paginas" className={linkClass}>
              <FileText size={18} /> Páginas
            </NavLink>
          )}
          {can(user, "blog:view") && (
            <NavLink to="/blog" className={linkClass}>
              <Newspaper size={18} /> Blog
            </NavLink>
          )}
          {can(user, "users:manage") && (
            <NavLink to="/usuarios" className={linkClass}>
              <Users size={18} /> Usuarios
            </NavLink>
          )}
        </nav>

        <div className="mt-auto flex flex-col gap-2 pt-4">
          <button onClick={toggle} className="btn-secondary justify-start">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            {theme === "dark" ? "Modo claro" : "Modo oscuro"}
          </button>
          <button onClick={() => logout()} className="btn-secondary justify-start text-foreground/70">
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
