import type { DatabaseReader } from "../_generated/server";
import type { TableNamesInDataModel } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

/**
 * Convert a title to a URL-safe slug.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generate a unique slug for any table with a `by_slug` index.
 * Checks the table's by_slug index and appends -2, -3, etc. on conflict.
 */
export async function uniqueSlug(
  db: DatabaseReader,
  title: string,
  table?: TableNamesInDataModel<DataModel>,
  excludeId?: string,
): Promise<string> {
  const tableName = table ?? "blogPosts";
  const baseSlug = slugify(title);

  const existing = await (db.query(tableName as any) as any)
    .withIndex("by_slug", (q: any) => q.eq("slug", baseSlug))
    .first();

  if (!existing || existing._id === excludeId) return baseSlug;

  let counter = 2;
  while (true) {
    const candidate = `${baseSlug}-${counter}`;
    const conflict = await (db.query(tableName as any) as any)
      .withIndex("by_slug", (q: any) => q.eq("slug", candidate))
      .first();
    if (!conflict || conflict._id === excludeId) return candidate;
    counter++;
  }
}
