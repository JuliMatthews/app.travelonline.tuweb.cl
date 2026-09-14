import { Route, Routes } from "react-router-dom";
import DashboardLayout from "@/layouts/DashboardLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardHome from "@/pages/DashboardHome";
import PaquetesPage from "@/pages/PaquetesPage";
import PaqueteNuevoPage from "@/pages/PaqueteNuevoPage";
import PaqueteEditarPage from "@/pages/PaqueteEditarPage";
import CotizacionesPage from "@/pages/CotizacionesPage";
import CotizacionDetallePage from "@/pages/CotizacionDetallePage";
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
        <Route path="/" element={<DashboardHome />} />
        <Route path="/paquetes" element={<PaquetesPage />} />
        <Route path="/paquetes/nuevo" element={<PaqueteNuevoPage />} />
        <Route path="/paquetes/:id/editar" element={<PaqueteEditarPage />} />
        <Route path="/cotizaciones" element={<CotizacionesPage />} />
        <Route path="/cotizaciones/:id" element={<CotizacionDetallePage />} />
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
