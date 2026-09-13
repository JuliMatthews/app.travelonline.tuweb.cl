import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { NewUserForm } from "@/components/NewUserForm";

export default async function NuevoUsuarioPage() {
  const session = await getSession();
  if (!can(session?.user, "users:manage")) {
    redirect("/");
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-brand-dark">Nuevo usuario</h1>
      <div className="mt-6">
        <NewUserForm />
      </div>
    </div>
  );
}
