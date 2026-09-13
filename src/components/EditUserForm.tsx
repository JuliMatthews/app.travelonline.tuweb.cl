"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role, UserRow } from "@/lib/types";
import { updateUserAction } from "@/app/(dashboard)/usuarios/actions";

export function EditUserForm({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await updateUserAction(user.id, { name, role, isActive, newPassword });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSaved(true);
    setNewPassword("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
      <p className="text-sm text-foreground/60">{user.email}</p>

      <label className="block">
        <span className="block text-sm font-medium text-brand-dark">Nombre</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" />
      </label>
      <label className="block">
        <span className="block text-sm font-medium text-brand-dark">Rol</span>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input mt-1">
          <option value="editor">Editor</option>
          <option value="admin_viewer">Admin (solo ver)</option>
          <option value="super_admin">Super admin</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          disabled={isSelf}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Cuenta activa
        {isSelf && <span className="text-xs text-foreground/40">(no puedes desactivar tu propia cuenta)</span>}
      </label>
      <label className="block">
        <span className="block text-sm font-medium text-brand-dark">Nueva contraseña</span>
        <input
          type="password"
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="input mt-1"
          placeholder="Dejar vacío para no cambiarla"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-700">Guardado.</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-brand px-6 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {saving ? "Guardando..." : "Guardar"}
      </button>
    </form>
  );
}
