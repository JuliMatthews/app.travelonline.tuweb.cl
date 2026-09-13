import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Fuera de `public/` a propósito — se sirve por una ruta propia
// (`app/uploads/[id]/route.ts`), nunca como archivo estático directo.
export const UPLOADS_DIR = path.join(process.cwd(), "storage", "uploads");

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

export function extensionForMime(mime: string): string | null {
  return ALLOWED_MIME[mime] ?? null;
}

export async function saveUploadedFile(id: string, extension: string, bytes: Buffer): Promise<void> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, `${id}.${extension}`), bytes);
}

// Nombre en disco = UUID de la fila, nunca el nombre original — evita
// colisiones y cualquier intento de path traversal por un nombre de archivo
// manipulado. Esta función solo arma el path final a partir del id/ext ya
// validados (UUID real, extensión de una lista fija), nunca de input crudo.
export function uploadFilePath(id: string, extension: string): string {
  return path.join(UPLOADS_DIR, `${id}.${extension}`);
}
