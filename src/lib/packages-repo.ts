import { pool } from "@/lib/db";
import type {
  PackageDetail,
  PackageInput,
  PackageSummary,
  Region,
} from "@/lib/types";

export async function listRegions(): Promise<Region[]> {
  const { rows } = await pool.query(
    "SELECT id, slug, name FROM regions ORDER BY sort_order"
  );
  return rows;
}

export async function listPackages(): Promise<PackageSummary[]> {
  const { rows } = await pool.query(`
    SELECT
      p.id, p.slug, p.title, p.subtitle, p.package_type, p.status,
      p.price_display_mode, p.price_from_clp, p.is_featured, p.show_in_promociones,
      p.updated_at,
      r.id AS region_id, r.slug AS region_slug, r.name AS region_name
    FROM packages p
    LEFT JOIN regions r ON r.id = p.region_id
    ORDER BY p.title
  `);

  return rows.map(rowToSummary);
}

export async function getPackageById(id: string): Promise<PackageDetail | null> {
  const { rows } = await pool.query(
    `
    SELECT
      p.*,
      r.id AS region_id, r.slug AS region_slug, r.name AS region_name
    FROM packages p
    LEFT JOIN regions r ON r.id = p.region_id
    WHERE p.id = $1
    `,
    [id]
  );
  if (rows.length === 0) return null;
  const row = rows[0];

  const [addons, roomOptions, itinerary, images] = await Promise.all([
    pool.query(
      "SELECT id, name, price_clp, sort_order FROM package_addons WHERE package_id = $1 ORDER BY sort_order",
      [id]
    ),
    pool.query(
      "SELECT id, label, price_adjustment_clp, sort_order FROM package_room_options WHERE package_id = $1 ORDER BY sort_order",
      [id]
    ),
    pool.query(
      "SELECT id, day_number, title, description, sort_order FROM package_itinerary_days WHERE package_id = $1 ORDER BY sort_order",
      [id]
    ),
    pool.query(
      `SELECT i.id, i.file_extension, i.alt_text, pi.sort_order
       FROM package_images pi JOIN images i ON i.id = pi.image_id
       WHERE pi.package_id = $1 ORDER BY pi.sort_order`,
      [id]
    ),
  ]);

  return {
    ...rowToSummary(row),
    content: row.content,
    durationDays: row.duration_days,
    durationNights: row.duration_nights,
    priceToClp: row.price_to_clp,
    priceUnit: row.price_unit,
    included: row.included,
    notIncluded: row.not_included,
    featuredSortOrder: row.featured_sort_order,
    addons: addons.rows.map((a) => ({
      id: a.id,
      name: a.name,
      priceClp: a.price_clp,
      sortOrder: a.sort_order,
    })),
    roomOptions: roomOptions.rows.map((r) => ({
      id: r.id,
      label: r.label,
      priceAdjustmentClp: r.price_adjustment_clp,
      sortOrder: r.sort_order,
    })),
    itinerary: itinerary.rows.map((d) => ({
      id: d.id,
      dayNumber: d.day_number,
      title: d.title,
      description: d.description,
      sortOrder: d.sort_order,
    })),
    images: images.rows.map((img) => ({
      id: img.id,
      extension: img.file_extension,
      altText: img.alt_text,
      sortOrder: img.sort_order,
    })),
  };
}

function rowToSummary(row: Record<string, unknown>): PackageSummary {
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    subtitle: row.subtitle as string | null,
    packageType: row.package_type as PackageSummary["packageType"],
    region: row.region_id
      ? { id: row.region_id as string, slug: row.region_slug as string, name: row.region_name as string }
      : null,
    status: row.status as PackageSummary["status"],
    priceDisplayMode: row.price_display_mode as PackageSummary["priceDisplayMode"],
    priceFromClp: row.price_from_clp as number | null,
    isFeatured: row.is_featured as boolean,
    showInPromociones: row.show_in_promociones as boolean,
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

async function replaceChildren(
  packageId: string,
  input: PackageInput
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM package_addons WHERE package_id = $1", [packageId]);
    for (const [i, addon] of input.addons.entries()) {
      await client.query(
        "INSERT INTO package_addons (package_id, name, price_clp, sort_order) VALUES ($1,$2,$3,$4)",
        [packageId, addon.name, addon.priceClp, i]
      );
    }

    await client.query("DELETE FROM package_room_options WHERE package_id = $1", [packageId]);
    for (const [i, room] of input.roomOptions.entries()) {
      await client.query(
        "INSERT INTO package_room_options (package_id, label, price_adjustment_clp, sort_order) VALUES ($1,$2,$3,$4)",
        [packageId, room.label, room.priceAdjustmentClp, i]
      );
    }

    await client.query("DELETE FROM package_itinerary_days WHERE package_id = $1", [packageId]);
    for (const [i, day] of input.itinerary.entries()) {
      await client.query(
        "INSERT INTO package_itinerary_days (package_id, day_number, title, description, sort_order) VALUES ($1,$2,$3,$4,$5)",
        [packageId, day.dayNumber, day.title, day.description, i]
      );
    }

    await client.query("DELETE FROM package_images WHERE package_id = $1", [packageId]);
    for (const [i, imageId] of input.imageIds.entries()) {
      await client.query(
        "INSERT INTO package_images (package_id, image_id, sort_order) VALUES ($1,$2,$3)",
        [packageId, imageId, i]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function createPackage(input: PackageInput, userId: string): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO packages (
       slug, title, subtitle, content, duration_days, duration_nights,
       package_type, price_display_mode, price_from_clp, price_to_clp, price_unit,
       included, not_included, region_id, is_featured, featured_sort_order,
       show_in_promociones, status, created_by, updated_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)
     RETURNING id`,
    [
      input.slug,
      input.title,
      input.subtitle || null,
      input.content || null,
      input.durationDays,
      input.durationNights,
      input.packageType,
      input.priceDisplayMode,
      input.priceFromClp,
      input.priceToClp,
      input.priceUnit,
      input.included || null,
      input.notIncluded || null,
      input.regionId,
      input.isFeatured,
      input.featuredSortOrder,
      input.showInPromociones,
      input.status,
      userId,
    ]
  );
  const id = rows[0].id as string;
  await replaceChildren(id, input);
  return id;
}

export async function updatePackage(id: string, input: PackageInput, userId: string): Promise<void> {
  await pool.query(
    `UPDATE packages SET
       slug = $1, title = $2, subtitle = $3, content = $4,
       duration_days = $5, duration_nights = $6, package_type = $7,
       price_display_mode = $8, price_from_clp = $9, price_to_clp = $10, price_unit = $11,
       included = $12, not_included = $13, region_id = $14, is_featured = $15,
       featured_sort_order = $16, show_in_promociones = $17, status = $18,
       updated_by = $19, updated_at = now()
     WHERE id = $20`,
    [
      input.slug,
      input.title,
      input.subtitle || null,
      input.content || null,
      input.durationDays,
      input.durationNights,
      input.packageType,
      input.priceDisplayMode,
      input.priceFromClp,
      input.priceToClp,
      input.priceUnit,
      input.included || null,
      input.notIncluded || null,
      input.regionId,
      input.isFeatured,
      input.featuredSortOrder,
      input.showInPromociones,
      input.status,
      userId,
      id,
    ]
  );
  await replaceChildren(id, input);
}

export async function deletePackage(id: string): Promise<void> {
  await pool.query("DELETE FROM packages WHERE id = $1", [id]);
}
