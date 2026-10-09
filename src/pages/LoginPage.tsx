import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/lib/theme";

// Login con el estilo del CRM de Francisco (fondo costero + tarjeta), pero con
// cuentas reales (correo + contraseña, sesiones y roles del backend PHP).
export default function LoginPage() {
  const { user, loading, login } = useAuth();
  useTheme(); // aplica el modo guardado (oscuro por defecto) también aquí
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await login(email, password);
    setSubmitting(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <main
      className="relative grid min-h-screen place-items-center px-4 py-8"
      style={{
        background:
          "radial-gradient(1100px 600px at 12% -10%, rgba(143,159,131,.30), transparent 60%), radial-gradient(900px 620px at 105% 108%, rgba(218,185,177,.30), transparent 62%), linear-gradient(158deg, #1f3355 0%, #2d4874 45%, #406e81 100%)",
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-[424px] rounded-[22px] border border-border bg-surface px-8 pb-6 pt-8 shadow-[0_28px_70px_rgba(10,18,35,.45)]"
      >
        <div className="flex items-center gap-3 text-[23px] font-extrabold tracking-tight text-[color:var(--heading)]">
          <span
            className="h-[13px] w-[13px] rounded-full"
            style={{ background: "linear-gradient(135deg, var(--rosa), var(--rosa-600))", boxShadow: "0 0 0 4px var(--rosa-050)" }}
          />
          Travel Online
        </div>
        <p className="mb-6 mt-1 text-[13px] text-[color:var(--muted)]">Sistema de gestión comercial · Panel y CRM</p>

        <label className="mb-1.5 block text-[12.5px] font-semibold" htmlFor="email">
          Correo
        </label>
        <input id="email" required type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="crm-field w-full py-3" />

        <label className="mb-1.5 mt-4 block text-[12.5px] font-semibold" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          required
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="crm-field w-full py-3"
        />

        {error && (
          <p className="mt-3 rounded-lg border border-[color:var(--rosa)] bg-[var(--rosa-050)] px-3 py-2 text-[12.5px] font-semibold text-[color:var(--risk)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 w-full rounded-[14px] py-3.5 text-[15px] font-bold text-white shadow-[0_6px_18px_rgba(45,72,116,.35)] transition hover:brightness-110 disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, var(--marino), var(--mar))" }}
        >
          {submitting ? "Ingresando…" : "Entrar"}
        </button>

        <p className="mt-6 border-t border-border pt-4 text-center text-[11.5px] text-[color:var(--muted)]">
          travelonline.cl · Acceso solo para el equipo autorizado
        </p>
      </form>
    </main>
  );
}
