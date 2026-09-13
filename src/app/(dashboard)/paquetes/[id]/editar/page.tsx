import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getPackageById, listRegions } from "@/lib/packages-repo";
import { PackageForm } from "@/components/PackageForm";

export default async function EditarPaquetePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!can(session?.user, "packages:edit")) {
    redirect("/paquetes");
  }

  const [pkg, regions] = await Promise.all([getPackageById(id), listRegions()]);
  if (!pkg) notFound();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-brand-dark">{pkg.title}</h1>
      <div className="mt-6">
        <PackageForm
          regions={regions}
          existing={pkg}
          canDelete={can(session?.user, "packages:delete")}
        />
      </div>
    </div>
  );
}
