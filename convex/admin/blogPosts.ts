import { v } from "convex/values";
import { internal } from "../_generated/api";
import { adminQuery, adminMutation } from "../lib/adminAuth";
import { uniqueSlug } from "../lib/slugify";

/**
 * Admin CRUD endpoints for blog posts.
 * All endpoints require admin authentication.
 */

const categoryValidator = v.union(
  v.literal("Guides"),
  v.literal("Claims Stories"),
  v.literal("Requirements")
);

/**
 * List all blog posts (including unpublished)
 */
export const list = adminQuery({
  args: { includeUnpublished: v.optional(v.boolean()) },
  handler: async (ctx, { includeUnpublished }) => {
    const posts = await ctx.db.query("blogPosts").collect();

    const filtered = includeUnpublished
      ? posts
      : posts.filter((p) => p.isPublished);

    return filtered.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  },
});

/**
 * Get a single blog post by ID
 */
export const get = adminQuery({
  args: { id: v.id("blogPosts") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/**
 * Create a new blog post
 */
export const create = adminMutation({
  args: {
    title: v.string(),
    slug: v.string(),
    excerpt: v.string(),
    content: v.optional(v.string()),
    category: categoryValidator,
    readTimeMinutes: v.number(),
    imageUrl: v.string(),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check for duplicate slug
    const existing = await ctx.db
      .query("blogPosts")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      throw new Error(`A blog post with slug "${args.slug}" already exists`);
    }

    const now = Date.now();
    const postId = await ctx.db.insert("blogPosts", {
      title: args.title,
      slug: args.slug,
      excerpt: args.excerpt,
      content: args.content,
      category: args.category,
      readTimeMinutes: args.readTimeMinutes,
      imageUrl: args.imageUrl,
      isPublished: args.isPublished ?? false,
      publishedAt: args.isPublished ? now : undefined,
      updatedAt: now,
    });

    return postId;
  },
});

/**
 * Update an existing blog post
 */
export const update = adminMutation({
  args: {
    id: v.id("blogPosts"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    content: v.optional(v.string()),
    category: v.optional(categoryValidator),
    readTimeMinutes: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Blog post not found");
    }

    // Check for duplicate slug if changing
    if (updates.slug && updates.slug !== existing.slug) {
      const duplicate = await ctx.db
        .query("blogPosts")
        .withIndex("by_slug", (q) => q.eq("slug", updates.slug!))
        .first();

      if (duplicate) {
        throw new Error(`A blog post with slug "${updates.slug}" already exists`);
      }
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };

    // Handle publish state change
    if (updates.isPublished !== undefined) {
      patch.isPublished = updates.isPublished;
      // Set publishedAt when first publishing
      if (updates.isPublished && !existing.publishedAt) {
        patch.publishedAt = Date.now();
      }
    }

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && key !== "isPublished") {
        patch[key] = value;
      }
    }

    await ctx.db.patch(id, patch);
    return id;
  },
});

/**
 * Unpublish a blog post
 */
export const unpublish = adminMutation({
  args: { id: v.id("blogPosts") },
  handler: async (ctx, { id }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Blog post not found");
    }

    await ctx.db.patch(id, {
      isPublished: false,
      updatedAt: Date.now(),
    });

    return id;
  },
});

/**
 * Publish a blog post
 */
export const publish = adminMutation({
  args: { id: v.id("blogPosts") },
  handler: async (ctx, { id }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Blog post not found");
    }

    // Cancel any pending scheduled publish
    if (existing.scheduledFunctionId) {
      try {
        await ctx.scheduler.cancel(existing.scheduledFunctionId as any);
      } catch {
        // Function may have already run or been cancelled
      }
    }

    const now = Date.now();
    await ctx.db.patch(id, {
      isPublished: true,
      publishedAt: existing.publishedAt || now,
      scheduledPublishAt: undefined,
      scheduledFunctionId: undefined,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Schedule a blog post to publish at a future time
 */
export const schedulePublish = adminMutation({
  args: {
    id: v.id("blogPosts"),
    scheduledPublishAt: v.number(),
  },
  handler: async (ctx, { id, scheduledPublishAt }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Blog post not found");
    }
    if (existing.isPublished) {
      throw new Error("Blog post is already published");
    }
    if (scheduledPublishAt <= Date.now()) {
      throw new Error("Scheduled time must be in the future");
    }

    // Cancel existing schedule if any
    if (existing.scheduledFunctionId) {
      try {
        await ctx.scheduler.cancel(existing.scheduledFunctionId as any);
      } catch {
        // Function may have already run or been cancelled
      }
    }

    // Schedule the publish
    const scheduledFunctionId = await ctx.scheduler.runAt(
      scheduledPublishAt,
      internal.blogPosts._publishScheduled,
      { id },
    );

    await ctx.db.patch(id, {
      scheduledPublishAt,
      scheduledFunctionId: scheduledFunctionId as unknown as string,
      updatedAt: Date.now(),
    });

    return id;
  },
});

/**
 * Cancel a scheduled publish
 */
export const cancelScheduledPublish = adminMutation({
  args: { id: v.id("blogPosts") },
  handler: async (ctx, { id }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Blog post not found");
    }
    if (!existing.scheduledFunctionId) {
      throw new Error("No scheduled publish to cancel");
    }

    try {
      await ctx.scheduler.cancel(existing.scheduledFunctionId as any);
    } catch {
      // Function may have already run or been cancelled
    }

    await ctx.db.patch(id, {
      scheduledPublishAt: undefined,
      scheduledFunctionId: undefined,
      updatedAt: Date.now(),
    });

    return id;
  },
});

/**
 * Delete a blog post permanently
 */
export const destroy = adminMutation({
  args: { id: v.id("blogPosts") },
  handler: async (ctx, { id }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Blog post not found");
    }

    await ctx.db.delete(id);
    return { deleted: true };
  },
});

/**
 * Search blog posts
 */
export const search = adminQuery({
  args: {
    query: v.string(),
    includeUnpublished: v.optional(v.boolean()),
  },
  handler: async (ctx, { query, includeUnpublished }) => {
    const searchLower = query.toLowerCase();

    const posts = await ctx.db.query("blogPosts").collect();

    const filtered = includeUnpublished
      ? posts
      : posts.filter((p) => p.isPublished);

    const matching = filtered.filter(
      (post) =>
        post.title.toLowerCase().includes(searchLower) ||
        post.excerpt.toLowerCase().includes(searchLower) ||
        post.slug.toLowerCase().includes(searchLower) ||
        post.category.toLowerCase().includes(searchLower)
    );

    return matching.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  },
});

/**
 * Generate slug from title
 */
export const generateSlug = adminQuery({
  args: { title: v.string() },
  handler: async (ctx, { title }) => uniqueSlug(ctx.db, title),
});
