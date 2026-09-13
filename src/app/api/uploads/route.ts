import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { pool } from "@/lib/db";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { extensionForMime, saveUploadedFile, MAX_UPLOAD_BYTES } from "@/lib/uploads";

// Fuera del matcher de proxy.ts (excluye /api) — el chequeo de sesión/rol
// vive acá adentro, igual que en el resto de las rutas API del proyecto.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !can(session.user, "packages:edit")) {
    return NextResponse.json({ message: "No autorizado" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ message: "Falta el archivo" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ message: "El archivo supera el máximo de 8 MB" }, { status: 400 });
  }

  const extension = extensionForMime(file.type);
  if (!extension) {
    return NextResponse.json(
      { message: "Formato no soportado — usa JPG, PNG o WEBP" },
      { status: 400 }
    );
  }

  const id = randomUUID();
  const bytes = Buffer.from(await file.arrayBuffer());
  await saveUploadedFile(id, extension, bytes);

  await pool.query(
    `INSERT INTO images (id, file_extension, original_filename, mime_type, size_bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, extension, file.name || null, file.type, file.size, session.user.id]
  );

  return NextResponse.json({ id, extension });
}
