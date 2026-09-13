import { pool } from "@/lib/db";
import type { BlogPostDetail, BlogPostInput, BlogPostSummary } from "@/lib/types";

export async function listBlogPosts(): Promise<BlogPostSummary[]> {
  const { rows } = await pool.query(`
    SELECT b.id, b.slug, b.title, b.excerpt, b.status, b.published_at,
           i.id AS image_id, i.file_extension, i.alt_text
    FROM blog_posts b
    LEFT JOIN images i ON i.id = b.featured_image_id
    ORDER BY b.published_at DESC NULLS LAST, b.title
  `);
  return rows.map(rowToSummary);
}

export async function getBlogPostById(id: string): Promise<BlogPostDetail | null> {
  const { rows } = await pool.query(
    `
    SELECT b.*, i.id AS image_id, i.file_extension, i.alt_text
    FROM blog_posts b
    LEFT JOIN images i ON i.id = b.featured_image_id
    WHERE b.id = $1
    `,
    [id]
  );
  if (rows.length === 0) return null;
  return { ...rowToSummary(rows[0]), content: rows[0].content };
}

function rowToSummary(row: Record<string, unknown>): BlogPostSummary {
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    excerpt: row.excerpt as string,
    status: row.status as BlogPostSummary["status"],
    publishedAt: row.published_at ? (row.published_at as Date).toISOString() : null,
    featuredImage: row.image_id
      ? {
          id: row.image_id as string,
          extension: row.file_extension as string,
          altText: row.alt_text as string | null,
          sortOrder: 0,
        }
      : null,
  };
}

export async function createBlogPost(input: BlogPostInput, userId: string): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO blog_posts (slug, title, excerpt, content, featured_image_id, status, published_at, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
     RETURNING id`,
    [
      input.slug,
      input.title,
      input.excerpt,
      input.content,
      input.featuredImageId,
      input.status,
      input.publishedAt,
      userId,
    ]
  );
  return rows[0].id as string;
}

export async function updateBlogPost(id: string, input: BlogPostInput, userId: string): Promise<void> {
  await pool.query(
    `UPDATE blog_posts SET
       slug = $1, title = $2, excerpt = $3, content = $4, featured_image_id = $5,
       status = $6, published_at = $7, updated_by = $8, updated_at = now()
     WHERE id = $9`,
    [
      input.slug,
      input.title,
      input.excerpt,
      input.content,
      input.featuredImageId,
      input.status,
      input.publishedAt,
      userId,
      id,
    ]
  );
}

export async function deleteBlogPost(id: string): Promise<void> {
  await pool.query("DELETE FROM blog_posts WHERE id = $1", [id]);
}
