"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/types";
import { createUserAction } from "@/app/(dashboard)/usuarios/actions";

export function NewUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await createUserAction({ email, password, name, role });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push("/usuarios");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
      <label className="block">
        <span className="block text-sm font-medium text-brand-dark">Nombre</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" />
      </label>
      <label className="block">
        <span className="block text-sm font-medium text-brand-dark">Correo</span>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input mt-1"
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium text-brand-dark">Contraseña inicial</span>
        <input
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input mt-1"
        />
        <span className="mt-1 block text-xs text-foreground/50">
          Entrégasela a la persona fuera de este sistema — no hay envío de correo automático todavía.
        </span>
      </label>
      <label className="block">
        <span className="block text-sm font-medium text-brand-dark">Rol</span>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input mt-1">
          <option value="editor">Editor</option>
          <option value="admin_viewer">Admin (solo ver)</option>
          <option value="super_admin">Super admin</option>
        </select>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-brand px-6 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {saving ? "Creando..." : "Crear usuario"}
      </button>
    </form>
  );
}
