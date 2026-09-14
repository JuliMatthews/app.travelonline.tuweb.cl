// Cliente HTTP para la API PHP — mismo patrón que hvac-manager-web
// (credentials: 'include' para que viaje la cookie de sesión PHP, incluso
// contra el proxy de dev en otro puerto).
export type ApiResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  const isJsonBody = typeof options.body === "string";
  const res = await fetch(path, {
    credentials: "include",
    headers: isJsonBody ? { "Content-Type": "application/json" } : undefined,
    ...options,
  });
  const data = (await res.json().catch(() => ({ ok: false, error: "Respuesta inválida del servidor" }))) as ApiResult<T>;
  return data;
}

export function apiGet<T>(path: string): Promise<ApiResult<T>> {
  return request<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function apiUpload<T>(path: string, file: File): Promise<ApiResult<T>> {
  const formData = new FormData();
  formData.set("file", file);
  return request<T>(path, { method: "POST", body: formData });
}
