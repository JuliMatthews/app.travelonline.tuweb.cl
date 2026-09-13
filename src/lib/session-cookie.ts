// Nombre de la cookie de sesión, aislado en su propio archivo sin
// dependencias — lo usan tanto `session.ts` (que sí toca la base) como
// `proxy.ts` (que corre en cada request y solo necesita el nombre, no toda
// la lógica de sesión/Postgres).
export const SESSION_COOKIE = "to_admin_session";
