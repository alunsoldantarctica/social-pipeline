import type { QueryCtx } from "../_generated/server";

/**
 * Shared localization helpers for public Convex queries.
 *
 * Behaviour:
 * - `locale === "en"` (or undefined) is a no-op; the English source record is returned as-is.
 * - For other locales, published rows from `contentTranslations` are overlaid onto the record.
 * - Supports dotted paths for indexed array fields: `requirements.0`, `features.2`,
 *   `contentTopics.0`. Arrays are copied before mutation so callers never see aliased state.
 * - Untranslated fields fall back to the English source — this is intentional.
 * - Brand / proper names / URLs / email addresses are never translated at this layer;
 *   translations are only created by deliberate admin flows.
 */

export type Locale = string | undefined;

type Translations = Record<string, string>;

function cloneIfNeeded<T>(value: T): T {
  if (Array.isArray(value)) return ([...value] as unknown) as T;
  return value;
}

/**
 * Apply a Record<field, value> overlay onto `doc`, honouring dotted array paths
 * like `requirements.0`. Returns a shallow copy of `doc` with any touched array
 * fields cloned.
 */
export function overlayTranslations<T extends Record<string, any>>(
  doc: T,
  translations: Translations,
): T {
  if (!translations || Object.keys(translations).length === 0) return doc;
  const out: Record<string, any> = { ...doc };
  // Track which array fields we've cloned so we only clone once.
  const clonedArrays = new Set<string>();

  for (const [key, value] of Object.entries(translations)) {
    if (typeof value !== "string") continue;
    const dot = key.indexOf(".");
    if (dot === -1) {
      out[key] = value;
      continue;
    }
    const head = key.slice(0, dot);
    const rest = key.slice(dot + 1);
    const idx = Number(rest);
    if (Number.isInteger(idx) && idx >= 0 && Array.isArray(out[head])) {
      if (!clonedArrays.has(head)) {
        out[head] = cloneIfNeeded(out[head]);
        clonedArrays.add(head);
      }
      out[head][idx] = value;
    }
    // Non-array dotted paths are not supported — ignore silently so new
    // translation keys can be added without breaking existing callers.
  }

  return out as T;
}

/**
 * Fetch published translations for a single content item.
 * Returns `{}` for `en` or when no translations exist.
 */
export async function fetchTranslations(
  ctx: QueryCtx,
  contentType: string,
  contentId: string,
  locale: Locale,
): Promise<Translations> {
  if (!locale || locale === "en") return {};
  const rows = await ctx.db
    .query("contentTranslations")
    .withIndex("by_content", (q) =>
      q.eq("contentType", contentType).eq("contentId", contentId).eq("locale", locale),
    )
    .collect();
  const result: Translations = {};
  for (const r of rows) {
    if (!r.status || r.status === "published") {
      result[r.field] = r.value;
    }
  }
  return result;
}

/**
 * Fetch published translations for many content items of one content type.
 * Returns `Map<contentId, Record<field, value>>`. Empty map for `en`.
 */
export async function fetchTranslationsBatch(
  ctx: QueryCtx,
  contentType: string,
  contentIds: string[],
  locale: Locale,
): Promise<Map<string, Translations>> {
  const result = new Map<string, Translations>();
  if (!locale || locale === "en" || contentIds.length === 0) return result;

  const idSet = new Set(contentIds);
  // Single scoped query over (contentType, locale); filtering in-memory is
  // cheaper than N point lookups for typical page sizes.
  const rows = await ctx.db
    .query("contentTranslations")
    .withIndex("by_type_locale", (q) =>
      q.eq("contentType", contentType).eq("locale", locale),
    )
    .collect();
  for (const r of rows) {
    if (!idSet.has(r.contentId)) continue;
    if (r.status && r.status !== "published") continue;
    let bucket = result.get(r.contentId);
    if (!bucket) {
      bucket = {};
      result.set(r.contentId, bucket);
    }
    bucket[r.field] = r.value;
  }
  return result;
}

/**
 * Convenience: localize a single document by fetching translations and overlaying.
 */
export async function localizeDoc<T extends { _id: string } & Record<string, any>>(
  ctx: QueryCtx,
  contentType: string,
  doc: T,
  locale: Locale,
): Promise<T> {
  const translations = await fetchTranslations(ctx, contentType, doc._id, locale);
  return overlayTranslations(doc, translations);
}

/**
 * Convenience: localize an array of documents of the same content type.
 * Performs a single batch translation fetch.
 */
export async function localizeDocs<
  T extends { _id: string } & Record<string, any>,
>(
  ctx: QueryCtx,
  contentType: string,
  docs: T[],
  locale: Locale,
): Promise<T[]> {
  if (!locale || locale === "en" || docs.length === 0) return docs;
  const translations = await fetchTranslationsBatch(
    ctx,
    contentType,
    docs.map((d) => d._id),
    locale,
  );
  return docs.map((d) => {
    const t = translations.get(d._id);
    return t ? overlayTranslations(d, t) : d;
  });
}

/**
 * Canonical content-type keys used throughout the translation system.
 * Kept as a single source of truth so code, admin UI, and audit scripts agree.
 */
export const CONTENT_TRANSLATION_TYPES = {
  blogPosts: "blogPosts",
  contentPods: "contentPods",
  destinations: "destinations",
  destinationCoverage: "destinationCoverage",
  operator: "operator",
  carrier: "carrier",
  insurancePlan: "insurancePlan",
  faqCategory: "faqCategory",
  faqQuestion: "faqQuestion",
} as const;

export type ContentTranslationType =
  (typeof CONTENT_TRANSLATION_TYPES)[keyof typeof CONTENT_TRANSLATION_TYPES];
