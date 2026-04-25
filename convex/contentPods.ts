/**
 * Public (non-admin) queries for content pods — used to render
 * /hub/[slug] pillar pages and to power cross-linking on child articles.
 */

import { v } from "convex/values";
import { query } from "./_generated/server";
import { localizeDoc, localizeDocs } from "./lib/contentLocalization";

/**
 * Active pods, ordered by priority (1 = highest).
 * Pass `locale` to overlay translations (English fallback when missing).
 */
export const listActive = query({
  args: { locale: v.optional(v.string()) },
  handler: async (ctx, { locale }) => {
    const pods = await ctx.db
      .query("contentPods")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const sorted = pods.sort((a, b) => a.priority - b.priority);
    const localized = await localizeDocs(ctx, "contentPods", sorted, locale);
    return localized.map((p) => ({
      _id: p._id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      pillarKeyword: p.pillarKeyword,
      priority: p.priority,
    }));
  },
});

/**
 * Hub data for a pod: pod metadata + published articles + (future) FAQs.
 * Pass `locale` to overlay translations on the pod and sibling articles.
 */
export const getHubBySlug = query({
  args: { slug: v.string(), locale: v.optional(v.string()) },
  handler: async (ctx, { slug, locale }) => {
    const podRaw = await ctx.db
      .query("contentPods")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!podRaw) return null;

    const articlesRaw = await ctx.db
      .query("blogPosts")
      .withIndex("by_pod", (q) => q.eq("podId", podRaw._id))
      .collect();

    const filteredArticles = articlesRaw
      .filter((a) => a.isPublished)
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));

    const [pod, articlesLocalized] = await Promise.all([
      localizeDoc(ctx, "contentPods", podRaw, locale),
      localizeDocs(ctx, "blogPosts", filteredArticles, locale),
    ]);

    const articles = articlesLocalized.map((a) => ({
      _id: a._id,
      slug: a.slug,
      title: a.title,
      excerpt: a.excerpt,
      imageUrl: a.imageUrl,
      category: a.category,
      readTimeMinutes: a.readTimeMinutes,
      publishedAt: a.publishedAt ?? null,
    }));

    return {
      pod: {
        _id: pod._id,
        slug: pod.slug,
        name: pod.name,
        description: pod.description,
        pillarKeyword: pod.pillarKeyword,
        pillarIntroContent: pod.pillarIntroContent ?? null,
      },
      articles,
      // FAQ source TBD; render only when non-empty.
      faqs: [] as Array<{ question: string; answer: string }>,
    };
  },
});
