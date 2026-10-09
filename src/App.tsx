import { Navigate, Route, Routes, useParams } from "react-router-dom";
import DashboardLayout from "@/layouts/DashboardLayout";
import LoginPage from "@/pages/LoginPage";
import TableroPage from "@/pages/TableroPage";
import PaquetesPage from "@/pages/PaquetesPage";
import PaqueteNuevoPage from "@/pages/PaqueteNuevoPage";
import PaqueteEditarPage from "@/pages/PaqueteEditarPage";
import SolicitudesPage from "@/pages/SolicitudesPage";
import SolicitudPage from "@/pages/SolicitudPage";
import ClientesPage from "@/pages/ClientesPage";
import ClienteDetallePage from "@/pages/ClienteDetallePage";
import PaginasPage from "@/pages/PaginasPage";
import PaginaEditarPage from "@/pages/PaginaEditarPage";
import BlogPage from "@/pages/BlogPage";
import BlogNuevoPage from "@/pages/BlogNuevoPage";
import BlogEditarPage from "@/pages/BlogEditarPage";
import UsuariosPage from "@/pages/UsuariosPage";
import UsuarioNuevoPage from "@/pages/UsuarioNuevoPage";
import UsuarioEditarPage from "@/pages/UsuarioEditarPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<DashboardLayout />}>
        <Route path="/" element={<TableroPage />} />
        <Route path="/paquetes" element={<PaquetesPage />} />
        <Route path="/paquetes/nuevo" element={<PaqueteNuevoPage />} />
        <Route path="/paquetes/:id/editar" element={<PaqueteEditarPage />} />
        <Route path="/solicitudes" element={<SolicitudesPage />} />
        <Route path="/solicitudes/:id" element={<SolicitudPage />} />
        {/* Direcciones antiguas del panel (antes "Cotizaciones") */}
        <Route path="/cotizaciones" element={<Navigate to="/solicitudes" replace />} />
        <Route path="/cotizaciones/:id" element={<LegacyQuoteRedirect />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/clientes/:id" element={<ClienteDetallePage />} />
        <Route path="/paginas" element={<PaginasPage />} />
        <Route path="/paginas/:slug" element={<PaginaEditarPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/nuevo" element={<BlogNuevoPage />} />
        <Route path="/blog/:id/editar" element={<BlogEditarPage />} />
        <Route path="/usuarios" element={<UsuariosPage />} />
        <Route path="/usuarios/nuevo" element={<UsuarioNuevoPage />} />
        <Route path="/usuarios/:id" element={<UsuarioEditarPage />} />
      </Route>
    </Routes>
  );
}

function LegacyQuoteRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/solicitudes/${id}`} replace />;
}
