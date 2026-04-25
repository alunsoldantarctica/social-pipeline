/**
 * Overlay translation fields onto a base record.
 * Returns a new object with translated fields replacing English originals.
 *
 * Usage (Astro server-side):
 *   const post = await convex.query(api.blogPosts.getBySlug, { slug });
 *   const translations = await convex.query(api.contentTranslations.getForContent, {
 *     contentType: "blogPosts", contentId: post._id, locale
 *   });
 *   const localizedPost = localize(post, translations);
 *
 * Usage (React with useQuery):
 *   const post = useQuery(api.blogPosts.getBySlug, { slug });
 *   const translations = useQuery(api.contentTranslations.getForContent, {
 *     contentType: "blogPosts", contentId: post?._id ?? "", locale
 *   });
 *   const localizedPost = localize(post, translations ?? {});
 */
export function localize<T extends Record<string, unknown>>(
  record: T,
  translations: Record<string, string>,
): T {
  if (!translations || Object.keys(translations).length === 0) return record;

  const result = { ...record };
  for (const [field, value] of Object.entries(translations)) {
    if (field in result) {
      (result as Record<string, unknown>)[field] = value;
    }
  }
  return result;
}

/**
 * Batch localize: overlay translations onto an array of records.
 * `translationMap` is Record<contentId, Record<field, value>>.
 */
export function localizeBatch<T extends Record<string, unknown> & { _id: string }>(
  records: T[],
  translationMap: Record<string, Record<string, string>>,
): T[] {
  if (!translationMap || Object.keys(translationMap).length === 0) return records;

  return records.map((record) => {
    const translations = translationMap[record._id];
    return translations ? localize(record, translations) : record;
  });
}
