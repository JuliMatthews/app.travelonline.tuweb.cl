import { useAuth } from "@/contexts/AuthContext";

export default function DashboardHome() {
  const { user } = useAuth();
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-dark">Hola, {user?.name}</h1>
      <p className="mt-2 text-foreground/60">
        Rol: <span className="font-medium">{user?.role}</span>
      </p>
    </div>
  );
}
