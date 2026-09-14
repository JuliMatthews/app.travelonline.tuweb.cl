import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import { PackageForm } from "@/components/PackageForm";
import type { Region } from "@/lib/types";

export default function PaqueteNuevoPage() {
  const { user } = useAuth();
  const [regions, setRegions] = useState<Region[] | null>(null);

  useEffect(() => {
    apiGet<{ regions: Region[] }>("/api-packages.php?action=regions").then((res) => {
      if (res.ok) setRegions(res.regions);
    });
  }, []);

  if (!can(user, "packages:create")) return <Navigate to="/paquetes" replace />;
  if (!regions) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Nuevo paquete</h1>
      <div className="mt-6">
        <PackageForm regions={regions} existing={null} canDelete={false} />
      </div>
    </div>
  );
}
