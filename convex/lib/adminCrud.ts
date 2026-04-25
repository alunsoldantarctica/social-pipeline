import { v } from "convex/values";
import { adminQuery, adminMutation } from "./adminAuth";
import { assertExists, assertNoReferences } from "./errors";
import type { TableNames, Doc } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";

// ─── Tier 1: Complete handler generators ────────────────────────────────

/**
 * Standard single-document fetch by ID.
 * Returns null if not found (callers can assertExists if needed).
 */
export function crudGet<T extends TableNames>(table: T) {
  return adminQuery({
    args: { id: v.id(table) },
    handler: async (ctx, { id }) => {
      return await ctx.db.get(id);
    },
  });
}

/**
 * Standard list with optional active/inactive filtering.
 *
 * @param table - Table name
 * @param opts.activeField - Field used for soft-delete filtering (default: "isActive")
 * @param opts.indexName - Index that leads with the active field (default: "by_order")
 * @param opts.sortField - Field to sort by (default: "order")
 * @param opts.sortDirection - "asc" or "desc" (default: "asc")
 */
export function crudList<T extends TableNames>(
  table: T,
  opts?: {
    activeField?: string;
    indexName?: string;
    sortField?: string;
    sortDirection?: "asc" | "desc";
  },
) {
  const activeField = opts?.activeField ?? "isActive";
  const indexName = opts?.indexName ?? "by_order";
  const sortField = opts?.sortField ?? "order";
  const sortDir = opts?.sortDirection ?? "asc";

  return adminQuery({
    args: { includeInactive: v.optional(v.boolean()) },
    handler: async (ctx, { includeInactive }) => {
      const items = includeInactive
        ? await ctx.db.query(table).collect()
        : await ctx.db
            .query(table)
            .withIndex(indexName, (q: any) => q.eq(activeField, true))
            .collect();

      return items.sort((a: any, b: any) => {
        const av = a[sortField] ?? 0;
        const bv = b[sortField] ?? 0;
        return sortDir === "asc" ? av - bv : bv - av;
      });
    },
  });
}

/**
 * Soft-delete: sets the active field to false.
 */
export function crudDeactivate<T extends TableNames>(
  table: T,
  entityName: string,
  opts?: { activeField?: string },
) {
  const activeField = opts?.activeField ?? "isActive";

  return adminMutation({
    args: { id: v.id(table) },
    handler: async (ctx, { id }) => {
      const existing = await ctx.db.get(id);
      assertExists(existing, entityName);
      await ctx.db.patch(id, {
        [activeField]: false,
        updatedAt: Date.now(),
      } as any);
      return id;
    },
  });
}

/**
 * Reactivate: sets the active field to true.
 */
export function crudReactivate<T extends TableNames>(
  table: T,
  entityName: string,
  opts?: { activeField?: string },
) {
  const activeField = opts?.activeField ?? "isActive";

  return adminMutation({
    args: { id: v.id(table) },
    handler: async (ctx, { id }) => {
      const existing = await ctx.db.get(id);
      assertExists(existing, entityName);
      await ctx.db.patch(id, {
        [activeField]: true,
        updatedAt: Date.now(),
      } as any);
      return id;
    },
  });
}

/**
 * Hard delete with optional reference checks.
 *
 * @param opts.checkReferences - Async callback returning an array of
 *   `{ count, entity }` objects for any non-zero references found.
 *   Each non-zero entry throws a REFERENCE_CONSTRAINT error.
 */
export function crudDestroy<T extends TableNames>(
  table: T,
  entityName: string,
  opts?: {
    checkReferences?: (
      ctx: any,
      id: any,
    ) => Promise<Array<{ count: number; entity: string }> | null>;
  },
) {
  return adminMutation({
    args: { id: v.id(table) },
    handler: async (ctx, { id }) => {
      const existing = await ctx.db.get(id);
      assertExists(existing, entityName);

      if (opts?.checkReferences) {
        const refs = await opts.checkReferences(ctx, id);
        if (refs) {
          for (const ref of refs) {
            assertNoReferences(ref.count, ref.entity, entityName);
          }
        }
      }

      await ctx.db.delete(id);
      return id;
    },
  });
}

/**
 * Text search across specified fields.
 * Matches if the query string appears in any of the search fields (case-insensitive).
 */
export function crudSearch<T extends TableNames>(
  table: T,
  searchFields: string[],
  opts?: {
    activeField?: string;
    enrichItem?: (ctx: any, item: any) => Promise<any>;
  },
) {
  const activeField = opts?.activeField ?? "isActive";

  return adminQuery({
    args: {
      query: v.string(),
      includeInactive: v.optional(v.boolean()),
    },
    handler: async (ctx, { query, includeInactive }) => {
      const allItems = await ctx.db.query(table).collect();
      const lowerQuery = query.toLowerCase();

      let results = allItems.filter((item: any) =>
        searchFields.some((field) => {
          const val = item[field];
          return typeof val === "string" && val.toLowerCase().includes(lowerQuery);
        }),
      );

      if (!includeInactive) {
        results = results.filter((item: any) => item[activeField] === true);
      }

      if (opts?.enrichItem) {
        results = await Promise.all(
          results.map((item: any) => opts.enrichItem!(ctx, item)),
        );
      }

      return results;
    },
  });
}

// ─── Tier 2: Handler helpers ────────────────────────────────────────────

/**
 * Get the next order value for a table (max + 1, or 0 if empty).
 */
export async function nextOrder(
  db: DatabaseReader,
  table: TableNames,
): Promise<number> {
  const items = await db.query(table).collect();
  if (items.length === 0) return 0;
  return Math.max(...items.map((item: any) => item.order ?? 0)) + 1;
}

/**
 * Filter undefined values from an updates object and add updatedAt.
 * Use inside custom create/update handlers.
 */
export function buildPatch(
  updates: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      patch[key] = value;
    }
  }
  return patch;
}
