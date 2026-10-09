import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Inbox,
  Package,
  Contact,
  FileText,
  Newspaper,
  Users,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
} from "lucide-react";
import { useAuth, can } from "@/contexts/AuthContext";
import { CrmProvider, useCrm } from "@/contexts/CrmContext";
import { useTheme } from "@/lib/theme";
import { KpiPanel } from "@/components/crm/KpiPanel";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  admin_viewer: "Gerencia · solo ver",
  editor: "Editor",
};

export default function DashboardLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground/50">
        Cargando…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <CrmProvider>
      <Shell />
    </CrmProvider>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { counts } = useCrm();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);
  if (!user) return null;

  // El panel de KPIs acompaña al tablero y a las solicitudes (como en el CRM de Francisco).
  const onTablero = location.pathname === "/";
  const onSolicitudes = location.pathname.startsWith("/solicitudes");

  const item = ({ isActive }: { isActive: boolean }) =>
    `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition-colors ${
      isActive
        ? "bg-white/15 font-semibold text-white shadow-[inset_3px_0_0_var(--rosa)]"
        : "text-[#b9c6d9] hover:bg-white/10 hover:text-white"
    }`;

  const navBadge = (n: number, title: string) =>
    n > 0 ? (
      <span title={title} className="ml-auto rounded-full bg-[var(--rosa)] px-2 py-px text-[11px] font-extrabold text-[#5c3a32]">
        {n}
      </span>
    ) : null;

  const sidebar = (
    <aside
      className="flex h-full w-[236px] flex-none flex-col px-[13px] py-[18px] text-[#e4e9f1]"
      style={{ background: "var(--sidebar)" }}
    >
      <div className="flex items-center gap-2.5 px-2.5 pb-1.5 pt-1 text-[17.5px] font-extrabold tracking-tight text-white">
        <span className="h-[11px] w-[11px] rounded-full" style={{ background: "linear-gradient(135deg, var(--rosa), var(--rosa-600))" }} />
        Travel Online
      </div>

      <div className="mx-1 mb-4 mt-3 flex items-center gap-2.5 rounded-[14px] border border-white/10 bg-white/[0.08] p-2.5">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-[10px] bg-gradient-to-br from-[#406e81] to-[#2d4874] text-[13px] font-extrabold text-white">
          {user.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold leading-tight text-white">{user.name}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#b6c4d8]">{ROLE_LABEL[user.role] ?? user.role}</p>
        </div>
      </div>

      <nav className="flex flex-col gap-[3px]" aria-label="Menú del panel">
        <NavLink to="/" end className={item}>
          <LayoutDashboard size={17} /> Tablero
        </NavLink>
        <NavLink to="/solicitudes" className={item}>
          <Inbox size={17} />
          <span>Solicitudes</span>
          {navBadge(counts.urgentes || counts.nuevas, counts.urgentes ? `${counts.urgentes} urgentes` : `${counts.nuevas} nuevas`)}
        </NavLink>
        {can(user, "clients:view") && (
          <NavLink to="/clientes" className={item}>
            <Contact size={17} /> Clientes
          </NavLink>
        )}
        <p className="mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[#8fa0b8]">Sitio web</p>
        <NavLink to="/paquetes" className={item}>
          <Package size={17} /> Paquetes
        </NavLink>
        {can(user, "pages:view") && (
          <NavLink to="/paginas" className={item}>
            <FileText size={17} /> Páginas
          </NavLink>
        )}
        {can(user, "blog:view") && (
          <NavLink to="/blog" className={item}>
            <Newspaper size={17} /> Blog
          </NavLink>
        )}
        {can(user, "users:manage") && (
          <NavLink to="/usuarios" className={item}>
            <Users size={17} /> Usuarios
          </NavLink>
        )}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-white/10 pt-3">
        <button type="button" onClick={toggle} className={item({ isActive: false })}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          {theme === "dark" ? "Modo claro" : "Modo oscuro"}
        </button>
        <button type="button" onClick={() => logout()} className={item({ isActive: false })}>
          <LogOut size={16} /> Cerrar sesión
        </button>
        <p className="px-3 pt-2 text-[11px] text-[#93a3ba]">travelonline.cl · Panel y CRM</p>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Barra lateral fija en escritorio */}
      <div className="hidden lg:flex">{sidebar}</div>

      {/* Menú desplegable en celular / tablet */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="h-full shadow-2xl">{sidebar}</div>
          <button type="button" aria-label="Cerrar menú" className="flex-1 bg-black/50" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex h-14 flex-none items-center gap-3 px-4 text-white lg:hidden"
          style={{ background: "var(--sidebar)" }}
        >
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuOpen}
            className="grid h-9 w-9 place-items-center rounded-lg bg-white/10"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <span className="flex items-center gap-2 font-extrabold">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--rosa)]" /> Travel Online
          </span>
          <button type="button" onClick={toggle} aria-label="Cambiar modo" className="ml-auto grid h-9 w-9 place-items-center rounded-lg bg-white/10">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="crm-main min-w-0 flex-1 overflow-y-auto px-4 pb-12 pt-5 sm:px-[30px] sm:pt-[26px]">
            <Outlet />
          </main>
          {(onTablero || onSolicitudes) && (
            // En solicitudes la tabla necesita más ancho: el panel aparece solo en pantallas muy anchas.
            <div className={onTablero ? "hidden xl:flex" : "hidden 2xl:flex"}>
              <KpiPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
