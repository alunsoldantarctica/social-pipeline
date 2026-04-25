import { query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { localizeDoc, localizeDocs } from "./lib/contentLocalization";

/**
 * List all published blog posts ordered by publish date.
 * Pass `locale` to overlay translations (English fallback when missing).
 */
export const list = query({
  args: { locale: v.optional(v.string()) },
  handler: async (ctx, { locale }) => {
    const posts = await ctx.db
      .query("blogPosts")
      .withIndex("by_published", (q) => q.eq("isPublished", true))
      .order("desc")
      .collect();
    return localizeDocs(ctx, "blogPosts", posts, locale);
  },
});

/**
 * Get a single blog post by slug
 */
/**
 * Publish a blog post at its scheduled time (called by scheduler).
 * Idempotent — no-ops if already published.
 */
export const _publishScheduled = internalMutation({
  args: { id: v.id("blogPosts") },
  handler: async (ctx, { id }) => {
    const post = await ctx.db.get(id);
    if (!post || post.isPublished) return;

    const now = Date.now();
    await ctx.db.patch(id, {
      isPublished: true,
      publishedAt: post.publishedAt || now,
      scheduledPublishAt: undefined,
      scheduledFunctionId: undefined,
      updatedAt: now,
    });
  },
});

/**
 * Safety net: publish any posts whose scheduledPublishAt is in the past
 * but are still unpublished (e.g. scheduler missed firing).
 */
export const _publishMissedPosts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const posts = await ctx.db
      .query("blogPosts")
      .withIndex("by_published", (q) => q.eq("isPublished", false))
      .collect();

    let published = 0;
    for (const post of posts) {
      if (post.scheduledPublishAt && post.scheduledPublishAt <= now) {
        await ctx.db.patch(post._id, {
          isPublished: true,
          publishedAt: post.publishedAt || now,
          scheduledPublishAt: undefined,
          scheduledFunctionId: undefined,
          updatedAt: now,
        });
        published++;
      }
    }

    if (published > 0) {
      console.log(`Safety net: published ${published} missed blog posts`);
    }
  },
});

/**
 * Get a blog post by ID (internal use — works for unpublished posts too)
 */
export const getById = internalQuery({
  args: { id: v.id("blogPosts") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const getBySlug = query({
  args: { slug: v.string(), locale: v.optional(v.string()) },
  handler: async (ctx, { slug, locale }) => {
    const posts = await ctx.db
      .query("blogPosts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .collect();

    const post = posts[0];
    if (!post || !post.isPublished) return null;
    return localizeDoc(ctx, "blogPosts", post, locale);
  },
});

/**
 * For an article in a pod, return up to `limit` sibling published articles
 * plus the pod's slug + name (for pillar back-link). Excludes the current post.
 */
export const getPodContext = query({
  args: {
    slug: v.string(),
    limit: v.optional(v.number()),
    locale: v.optional(v.string()),
  },
  handler: async (ctx, { slug, limit, locale }) => {
    const max = limit ?? 3;
    const post = await ctx.db
      .query("blogPosts")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!post || !post.podId) return null;

    const pod = await ctx.db.get(post.podId);
    if (!pod) return null;

    const siblings = await ctx.db
      .query("blogPosts")
      .withIndex("by_pod", (q) => q.eq("podId", post.podId))
      .collect();

    const siblingList = siblings
      .filter((s) => s._id !== post._id && s.isPublished)
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
      .slice(0, max);

    const [localizedPod, localizedSiblings] = await Promise.all([
      localizeDoc(ctx, "contentPods", pod, locale),
      localizeDocs(ctx, "blogPosts", siblingList, locale),
    ]);

    return {
      pod: { slug: localizedPod.slug, name: localizedPod.name },
      siblings: localizedSiblings.map((s) => ({
        slug: s.slug,
        title: s.title,
        excerpt: s.excerpt,
        imageUrl: s.imageUrl,
        readTimeMinutes: s.readTimeMinutes,
      })),
    };
  },
});
