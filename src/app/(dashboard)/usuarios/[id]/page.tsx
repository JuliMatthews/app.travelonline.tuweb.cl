import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getUserById } from "@/lib/users-repo";
import { EditUserForm } from "@/components/EditUserForm";

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!can(session?.user, "users:manage")) {
    redirect("/");
  }

  const user = await getUserById(id);
  if (!user) notFound();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-brand-dark">{user.name}</h1>
      <div className="mt-6">
        <EditUserForm user={user} isSelf={session!.user.id === user.id} />
      </div>
    </div>
  );
}
