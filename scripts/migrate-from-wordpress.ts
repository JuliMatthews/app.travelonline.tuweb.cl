// Migra TODO el contenido real desde WordPress headless (WPGraphQL, todavía
// vivo en este punto del plan) hacia la Postgres nueva que reemplaza a
// WordPress. Reutiliza el *shape* de las queries de `web/src/lib/wp.ts`
// (copiado/adaptado acá, no importado — ese archivo está destinado a
// desaparecer en la Fase 6). Idempotente: se puede re-correr sin duplicar.
//
// Uso: pnpm migrate-wp [--force]
//   --force: permite volver a pisar los hijos (addons/room_options/
//   itinerary/imágenes) de un paquete que YA fue editado a mano en el
//   panel (updated_by IS NOT NULL). Sin --force esos paquetes se saltan
//   por completo para no destruir una edición real.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(scriptDir, "..", ".env.local"));

// Pool local (no el compartido de @travelonline/core/db) para no depender
// del orden de evaluación de imports de otro módulo — ver nota en
// migrate-db.ts, mismo problema con `process.loadEnvFile`.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

import { saveUploadedFile, extensionForMime } from "../src/lib/uploads";

const WP_ENDPOINT = process.env.WPGRAPHQL_ENDPOINT ?? "http://localhost:8090/graphql";
const FORCE = process.argv.includes("--force");

// Copiadas UNA SOLA VEZ desde web/src/lib/wp.ts — a partir de esta
// migración, `is_featured`/`show_in_promociones` son datos editables en el
// panel, no vuelven a leerse de código.
const FEATURED_SLUGS = [
  "super-dubai",
  "venecia-a-roma",
  "circuito-china-osos-pandas",
  "caribe-romantico-punta-cana-todo-incluido",
  "circuito-las-vegas-gran-canon",
  "turquia-admirable",
];

const LEGACY_PRODUCT_SLUGS = [
  "british", "buzios-todo-incluido", "cancun-todo-incluido",
  "caribe-romantico-cancun-todo-incluido", "caribe-romantico-punta-cana-todo-incluido",
  "caribe-romantico-san-andres-todo-incluido", "dubai-maravilloso-2x1",
  "europa-en-17-dias", "gran-tour-europeo-todo-incluido", "khalifa", "nilo",
  "paris-alpes-e-italia", "polski", "punta-cana-todo-incluido",
  "rio-de-janeiro-buzios", "rivera-maya-todo-incluido", "san-andres-todo-incluido",
  "super-dubai", "super-egipto-con-crucero", "super-grecia-esencial",
  "super-jordania", "super-turquia-con-tren", "tesoros-balcanicos",
  "triangulo-de-oro", "turquia-2x1", "turquia-admirable", "vaporetto",
  "varadero-todo-incluido", "venecia-a-roma",
];

async function wpFetch<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(WP_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`WPGraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

type WpPackage = {
  slug: string;
  title: string;
  subtitle: string | null;
  packageType: string | null;
  content: string;
  durationDays: number | null;
  durationNights: number | null;
  priceDisplayMode: string | null;
  priceFromClp: number | null;
  priceUnit: "per_person" | "per_couple" | null;
  included: string | null;
  notIncluded: string | null;
  heroGallery: string[];
  itinerary: { dayNumber: number | null; title: string; description: string }[];
  addons: { name: string; priceClp: number }[];
  roomOptions: { label: string; priceAdjustmentClp: number }[];
  regions: { nodes: { slug: string }[] };
};

type AllPackagesFullResponse = {
  destinationPackages: {
    pageInfo: { hasNextPage: boolean; endCursor: string };
    nodes: WpPackage[];
  };
};

async function fetchAllPackagesFromWp(): Promise<WpPackage[]> {
  const all: WpPackage[] = [];
  let after: string | null = null;

  for (;;) {
    const data: AllPackagesFullResponse = await wpFetch<AllPackagesFullResponse>(
      /* GraphQL */ `
        query AllPackagesFull($after: String) {
          destinationPackages(first: 50, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              slug title subtitle packageType content
              durationDays durationNights priceDisplayMode priceFromClp priceUnit
              included notIncluded heroGallery
              itinerary { dayNumber title description }
              addons { name priceClp }
              roomOptions { label priceAdjustmentClp }
              regions { nodes { slug } }
            }
          }
        }
      `,
      { after }
    );
    all.push(...data.destinationPackages.nodes);
    if (!data.destinationPackages.pageInfo.hasNextPage) break;
    after = data.destinationPackages.pageInfo.endCursor;
  }

  return all;
}

async function fetchPageFromWp(slug: string) {
  const data = await wpFetch<{
    page: { title: string; content: string; heroGallery: string[] } | null;
  }>(
    /* GraphQL */ `
      query PageBySlug($uri: ID!) {
        page(id: $uri, idType: URI) {
          title
          content
          heroGallery
        }
      }
    `,
    { uri: `/${slug}/` }
  );
  return data.page;
}

async function fetchAllBlogPostsFromWp() {
  const data = await wpFetch<{
    posts: {
      nodes: {
        slug: string;
        title: string;
        excerpt: string;
        content: string;
        date: string;
        featuredImage: { node: { sourceUrl: string } } | null;
      }[];
    };
  }>(
    /* GraphQL */ `
      query AllBlogPostsFull {
        posts(first: 100) {
          nodes {
            slug title excerpt content date
            featuredImage { node { sourceUrl(size: LARGE) } }
          }
        }
      }
    `
  );
  return data.posts.nodes;
}

// Descarga una imagen de WP y la deja en el storage nuevo — reutiliza la
// fila existente por `source_url` si ya se migró en una corrida anterior
// (idempotencia), sin volver a descargar el archivo.
async function migrateImage(sourceUrl: string, uploadedBy: string | null): Promise<string | null> {
  const existing = await pool.query("SELECT id FROM images WHERE source_url = $1", [sourceUrl]);
  if (existing.rows.length > 0) {
    return existing.rows[0].id as string;
  }

  const res = await fetch(sourceUrl);
  if (!res.ok) {
    console.warn(`  ! no se pudo descargar imagen: ${sourceUrl} (${res.status})`);
    return null;
  }
  const contentType = res.headers.get("content-type") ?? "";
  const extension = extensionForMime(contentType.split(";")[0].trim());
  if (!extension) {
    console.warn(`  ! tipo de imagen no soportado (${contentType}): ${sourceUrl}`);
    return null;
  }

  const id = randomUUID();
  const bytes = Buffer.from(await res.arrayBuffer());
  await saveUploadedFile(id, extension, bytes);

  await pool.query(
    `INSERT INTO images (id, file_extension, mime_type, size_bytes, source_url, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, extension, contentType.split(";")[0].trim(), bytes.length, sourceUrl, uploadedBy]
  );
  return id;
}

async function migratePackages() {
  console.log("\n=== Paquetes ===");
  const wpPackages = await fetchAllPackagesFromWp();
  console.log(`${wpPackages.length} paquetes encontrados en WordPress.`);

  const regionRows = await pool.query("SELECT id, slug FROM regions");
  const regionBySlug = new Map(regionRows.rows.map((r) => [r.slug as string, r.id as string]));

  let migrated = 0;
  let skipped = 0;

  for (const wp of wpPackages) {
    const regionSlugs = wp.regions.nodes.map((n) => n.slug);
    if (regionSlugs.length !== 1) {
      console.error(
        `  ✗ ${wp.slug}: tiene ${regionSlugs.length} regiones (se esperaba exactamente 1) — se salta.`
      );
      continue;
    }
    const regionId = regionBySlug.get(regionSlugs[0]);
    if (!regionId) {
      console.error(`  ✗ ${wp.slug}: región "${regionSlugs[0]}" no existe en la tabla regions — se salta.`);
      continue;
    }

    const existing = await pool.query(
      "SELECT id, updated_by FROM packages WHERE slug = $1",
      [wp.slug]
    );
    const isHumanEdited = existing.rows.length > 0 && existing.rows[0].updated_by !== null;
    if (isHumanEdited && !FORCE) {
      console.log(`  · ${wp.slug}: ya fue editado a mano en el panel — se salta (usar --force para pisarlo).`);
      skipped++;
      continue;
    }

    const packageType = wp.packageType ?? "circuito";
    const priceDisplayMode = wp.priceDisplayMode ?? "bajo_consulta";
    const priceUnit = wp.priceUnit ?? "per_person";

    const { rows } = await pool.query(
      `INSERT INTO packages (
         slug, title, subtitle, content, duration_days, duration_nights,
         package_type, price_display_mode, price_from_clp, price_unit,
         included, not_included, region_id, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'published')
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, content = EXCLUDED.content,
         duration_days = EXCLUDED.duration_days, duration_nights = EXCLUDED.duration_nights,
         package_type = EXCLUDED.package_type, price_display_mode = EXCLUDED.price_display_mode,
         price_from_clp = EXCLUDED.price_from_clp, price_unit = EXCLUDED.price_unit,
         included = EXCLUDED.included, not_included = EXCLUDED.not_included,
         region_id = EXCLUDED.region_id, updated_at = now()
       RETURNING id`,
      [
        wp.slug, wp.title, wp.subtitle, wp.content, wp.durationDays, wp.durationNights,
        packageType, priceDisplayMode, wp.priceFromClp, priceUnit,
        wp.included, wp.notIncluded, regionId,
      ]
    );
    const packageId = rows[0].id as string;

    await pool.query("DELETE FROM package_addons WHERE package_id = $1", [packageId]);
    for (const [i, a] of wp.addons.entries()) {
      await pool.query(
        "INSERT INTO package_addons (package_id, name, price_clp, sort_order) VALUES ($1,$2,$3,$4)",
        [packageId, a.name, a.priceClp, i]
      );
    }

    await pool.query("DELETE FROM package_room_options WHERE package_id = $1", [packageId]);
    for (const [i, r] of wp.roomOptions.entries()) {
      await pool.query(
        "INSERT INTO package_room_options (package_id, label, price_adjustment_clp, sort_order) VALUES ($1,$2,$3,$4)",
        [packageId, r.label, r.priceAdjustmentClp, i]
      );
    }

    await pool.query("DELETE FROM package_itinerary_days WHERE package_id = $1", [packageId]);
    for (const [i, d] of wp.itinerary.entries()) {
      await pool.query(
        "INSERT INTO package_itinerary_days (package_id, day_number, title, description, sort_order) VALUES ($1,$2,$3,$4,$5)",
        [packageId, d.dayNumber, d.title, d.description, i]
      );
    }

    await pool.query("DELETE FROM package_images WHERE package_id = $1", [packageId]);
    let sortOrder = 0;
    for (const url of wp.heroGallery) {
      const imageId = await migrateImage(url, null);
      if (!imageId) continue;
      await pool.query(
        "INSERT INTO package_images (package_id, image_id, sort_order) VALUES ($1,$2,$3)",
        [packageId, imageId, sortOrder++]
      );
    }

    migrated++;
    console.log(`  ✓ ${wp.slug} (${wp.heroGallery.length} fotos, ${wp.addons.length} addons, ${wp.itinerary.length} días)`);
  }

  console.log(`\nPaquetes migrados: ${migrated}. Saltados (ya editados a mano): ${skipped}.`);

  console.log("\n=== Marcando destacados y promociones ===");
  const featured = await pool.query(
    "UPDATE packages SET is_featured = true WHERE slug = ANY($1) RETURNING slug",
    [FEATURED_SLUGS]
  );
  console.log(`  is_featured = true en ${featured.rows.length}/${FEATURED_SLUGS.length} slugs esperados.`);

  const promos = await pool.query(
    "UPDATE packages SET show_in_promociones = true WHERE slug = ANY($1) RETURNING slug",
    [LEGACY_PRODUCT_SLUGS]
  );
  console.log(`  show_in_promociones = true en ${promos.rows.length}/${LEGACY_PRODUCT_SLUGS.length} slugs esperados.`);
}

async function migrateStaticPages() {
  console.log("\n=== Páginas estáticas (Nosotros, Contacto) ===");
  for (const slug of ["nosotros", "contacto"]) {
    const page = await fetchPageFromWp(slug);
    if (!page) {
      console.warn(`  ! no se encontró la página "${slug}" en WordPress.`);
      continue;
    }

    const existing = await pool.query("SELECT id, updated_by FROM static_pages WHERE slug = $1", [slug]);
    if (existing.rows.length > 0 && existing.rows[0].updated_by !== null && !FORCE) {
      console.log(`  · ${slug}: ya editada a mano en el panel — se salta.`);
      continue;
    }

    const { rows } = await pool.query(
      `INSERT INTO static_pages (slug, title, content) VALUES ($1,$2,$3)
       ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, updated_at = now()
       RETURNING id`,
      [slug, page.title, page.content]
    );
    const pageId = rows[0].id as string;

    await pool.query("DELETE FROM static_page_images WHERE page_id = $1", [pageId]);
    let i = 0;
    for (const url of page.heroGallery) {
      const imageId = await migrateImage(url, null);
      if (!imageId) continue;
      await pool.query(
        "INSERT INTO static_page_images (page_id, image_id, sort_order) VALUES ($1,$2,$3)",
        [pageId, imageId, i++]
      );
    }
    console.log(`  ✓ ${slug}`);
  }
}

async function migrateBlogPosts() {
  console.log("\n=== Blog ===");
  const posts = await fetchAllBlogPostsFromWp();
  console.log(`${posts.length} posts encontrados en WordPress.`);

  for (const post of posts) {
    const existing = await pool.query("SELECT id, updated_by FROM blog_posts WHERE slug = $1", [post.slug]);
    if (existing.rows.length > 0 && existing.rows[0].updated_by !== null && !FORCE) {
      console.log(`  · ${post.slug}: ya editado a mano en el panel — se salta.`);
      continue;
    }

    const featuredImageId = post.featuredImage
      ? await migrateImage(post.featuredImage.node.sourceUrl, null)
      : null;

    await pool.query(
      `INSERT INTO blog_posts (slug, title, excerpt, content, featured_image_id, status, published_at)
       VALUES ($1,$2,$3,$4,$5,'published',$6)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title, excerpt = EXCLUDED.excerpt, content = EXCLUDED.content,
         featured_image_id = EXCLUDED.featured_image_id, published_at = EXCLUDED.published_at,
         updated_at = now()`,
      [post.slug, post.title, post.excerpt, post.content, featuredImageId, post.date]
    );
    console.log(`  ✓ ${post.slug}`);
  }
}

async function main() {
  console.log(`Migrando desde WordPress (${WP_ENDPOINT})${FORCE ? " [--force]" : ""}...`);
  await migratePackages();
  await migrateStaticPages();
  await migrateBlogPosts();
  console.log("\nListo.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
