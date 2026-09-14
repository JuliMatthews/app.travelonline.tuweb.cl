import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { apiGet } from "@/lib/api";
import { useAuth, can } from "@/contexts/AuthContext";
import { PackageForm } from "@/components/PackageForm";
import type { PackageDetail, Region } from "@/lib/types";

export default function PaqueteEditarPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [regions, setRegions] = useState<Region[] | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiGet<{ package: PackageDetail }>(`/api-packages.php?action=get&id=${id}`).then((res) => {
      if (res.ok) setPkg(res.package);
      else setNotFound(true);
    });
    apiGet<{ regions: Region[] }>("/api-packages.php?action=regions").then((res) => {
      if (res.ok) setRegions(res.regions);
    });
  }, [id]);

  if (!can(user, "packages:edit")) return <Navigate to="/paquetes" replace />;
  if (notFound) return <p className="text-foreground/60">Paquete no encontrado.</p>;
  if (!pkg || !regions) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">{pkg.title}</h1>
      <div className="mt-6">
        <PackageForm regions={regions} existing={pkg} canDelete={can(user, "packages:delete")} />
      </div>
    </div>
  );
}
