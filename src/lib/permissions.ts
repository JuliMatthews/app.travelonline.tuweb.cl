import type { Role } from "@/lib/types";

// Único lugar donde vive "quién puede hacer qué" — nunca escribir
// `if (role === "...")` sueltos por el código. El ocultamiento de botones en
// la UI es solo cosmético; el chequeo que realmente protege siempre corre en
// el servidor (Route Handler / Server Action), llamando a `can()`.
export type Action =
  | "quotes:view"
  | "quotes:edit"
  | "packages:view"
  | "packages:create"
  | "packages:edit"
  | "packages:delete"
  | "pages:view"
  | "pages:edit"
  | "blog:view"
  | "blog:create"
  | "blog:edit"
  | "blog:delete"
  | "users:manage"
  | "settings:manage";

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Action>> = {
  super_admin: new Set<Action>([
    "quotes:view",
    "quotes:edit",
    "packages:view",
    "packages:create",
    "packages:edit",
    "packages:delete",
    "pages:view",
    "pages:edit",
    "blog:view",
    "blog:create",
    "blog:edit",
    "blog:delete",
    "users:manage",
    "settings:manage",
  ]),
  admin_viewer: new Set<Action>(["quotes:view", "packages:view", "pages:view", "blog:view"]),
  editor: new Set<Action>([
    "quotes:view",
    "quotes:edit",
    "packages:view",
    "packages:edit",
    "pages:view",
    "blog:view",
  ]),
};

export function can(user: { role: Role } | null | undefined, action: Action): boolean {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role].has(action);
}
