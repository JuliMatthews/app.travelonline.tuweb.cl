import { pool } from "@/lib/db";
import type { StaticPage } from "@/lib/types";

export async function listStaticPages(): Promise<StaticPage[]> {
  const { rows } = await pool.query(
    "SELECT id, slug, title, content, updated_at FROM static_pages ORDER BY slug"
  );
  return rows.map(rowToPage);
}

export async function getStaticPageBySlug(slug: string): Promise<StaticPage | null> {
  const { rows } = await pool.query(
    "SELECT id, slug, title, content, updated_at FROM static_pages WHERE slug = $1",
    [slug]
  );
  if (rows.length === 0) return null;
  return rowToPage(rows[0]);
}

export async function updateStaticPage(
  slug: string,
  input: { title: string; content: string },
  userId: string
): Promise<void> {
  await pool.query(
    `UPDATE static_pages SET title = $1, content = $2, updated_by = $3, updated_at = now()
     WHERE slug = $4`,
    [input.title, input.content, userId, slug]
  );
}

function rowToPage(row: Record<string, unknown>): StaticPage {
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    content: row.content as string,
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}
