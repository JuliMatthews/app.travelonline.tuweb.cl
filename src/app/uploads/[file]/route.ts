import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { uploadFilePath } from "@/lib/uploads";

// Público a propósito — estas imágenes las muestra `web/` a cualquier
// visitante, igual que antes las servía WordPress. Solo la subida
// (POST /api/uploads) exige sesión.
const FILE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$/i;

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const match = FILE_RE.exec(file);
  if (!match) {
    return NextResponse.json({ message: "No encontrado" }, { status: 404 });
  }

  const [, id, extension] = match;
  try {
    const bytes = await readFile(uploadFilePath(id, extension));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": MIME_BY_EXT[extension.toLowerCase()],
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ message: "No encontrado" }, { status: 404 });
  }
}
