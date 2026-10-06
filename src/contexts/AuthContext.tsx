import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import type { Role } from "@/lib/types";

export type AuthUser = { id: string; email: string; name: string; role: Role };

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const result = await apiGet<{ authenticated: boolean; user?: AuthUser }>("/api-auth.php?action=me");
    setUser(result.ok && result.authenticated ? result.user ?? null : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  async function login(email: string, password: string) {
    const result = await apiPost<{ user?: AuthUser }>("/api-auth.php?action=login", { email, password });
    if (!result.ok) return { ok: false as const, error: result.error };
    await checkAuth();
    return { ok: true as const };
  }

  async function logout() {
    await apiPost("/api-auth.php?action=logout", {});
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  super_admin: [
    "quotes:view", "quotes:edit",
    "clients:view", "clients:edit",
    "packages:view", "packages:create", "packages:edit", "packages:delete",
    "pages:view", "pages:edit",
    "blog:view", "blog:create", "blog:edit", "blog:delete",
    "users:manage", "settings:manage",
  ],
  admin_viewer: ["quotes:view", "clients:view", "packages:view", "pages:view", "blog:view"],
  editor: ["quotes:view", "quotes:edit", "clients:view", "clients:edit", "packages:view", "packages:edit", "pages:view", "blog:view"],
};

// Solo para mostrar/ocultar botones — el chequeo que realmente protege
// siempre vive en el backend PHP (require_auth()).
export function can(user: AuthUser | null, action: string): boolean {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role].includes(action);
}
