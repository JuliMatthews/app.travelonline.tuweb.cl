import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listRegions } from "@/lib/packages-repo";
import { PackageForm } from "@/components/PackageForm";

export default async function NuevoPaquetePage() {
  const session = await getSession();
  if (!can(session?.user, "packages:create")) {
    redirect("/paquetes");
  }

  const regions = await listRegions();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-brand-dark">Nuevo paquete</h1>
      <div className="mt-6">
        <PackageForm regions={regions} existing={null} canDelete={false} />
      </div>
    </div>
  );
}
