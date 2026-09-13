"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="mt-6 w-full rounded-lg border border-black/10 px-3 py-2 text-left text-sm text-foreground/70 hover:bg-brand-light"
    >
      Cerrar sesión
    </button>
  );
}
