import { defineTable } from "convex/server";
import { v } from "convex/values";

export const contentTables = {
  // ===== CMS CONTENT =====

  blogPosts: defineTable({
    title: v.string(),
    slug: v.string(),
    excerpt: v.string(),
    content: v.optional(v.string()),
    // TODO: Customize categories for your niche
    category: v.string(),
    readTimeMinutes: v.number(),
    imageUrl: v.string(),
    isPublished: v.boolean(),
    publishedAt: v.optional(v.number()),
    scheduledPublishAt: v.optional(v.number()),
    scheduledFunctionId: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"])
    .index("by_published", ["isPublished", "publishedAt"]),

  // ===== CONTENT PIPELINE =====

  articleWorkflows: defineTable({
    topic: v.string(),
    keywords: v.array(v.string()),
    targetAudience: v.string(),
    status: v.union(
      v.literal("research_in_progress"),
      v.literal("research_review"),
      v.literal("outline_in_progress"),
      v.literal("outline_review"),
      v.literal("draft_in_progress"),
      v.literal("draft_review"),
      v.literal("completed"),
      v.literal("rejected")
    ),
    // Output format for this workflow — determines which draft instructions are used
    // and which publish adapter to use (blog, thread, newsletter, etc.)
    outputFormat: v.optional(v.union(
      v.literal("blog_post"),
      v.literal("twitter_thread"),
      v.literal("linkedin_article"),
      v.literal("newsletter_issue"),
    )),
    researchOutput: v.optional(v.any()),
    outlineOutput: v.optional(v.any()),
    draftOutput: v.optional(v.any()),
    feedbackHistory: v.array(v.object({
      stage: v.string(),
      action: v.union(v.literal("approve"), v.literal("revise"), v.literal("reject")),
      feedback: v.optional(v.string()),
      timestamp: v.number(),
    })),
    revisionCount: v.object({
      research: v.number(),
      outline: v.number(),
      draft: v.number(),
    }),
    threadId: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    blogPostId: v.optional(v.id("blogPosts")),
    socialPublish: v.optional(v.object({
      status: v.union(
        v.literal("pending"),
        v.literal("published"),
        v.literal("failed"),
        v.literal("skipped"),
      ),
      provider: v.literal("zernio"),
      profileIds: v.optional(v.array(v.string())),
      postIds: v.optional(v.array(v.string())),
      scheduledAt: v.optional(v.number()),
      publishedAt: v.optional(v.number()),
      attemptedAt: v.optional(v.number()),
      error: v.optional(v.string()),
    })),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

  // ===== CONTENT TRANSLATIONS (i18n overlay) =====

  contentTranslations: defineTable({
    contentType: v.string(),     // table name: "blogPosts", etc.
    contentId: v.string(),       // _id of the source record (stored as string)
    locale: v.string(),          // "fr", "es" (never "en" — English is the source of truth)
    field: v.string(),           // field name: "title", "excerpt", "description", etc.
    value: v.string(),           // translated text
    status: v.optional(v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("needs_review"),
    )),
    translatedBy: v.optional(v.string()),  // "auto" | admin user ID
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_content", ["contentType", "contentId", "locale"])
    .index("by_type_locale", ["contentType", "locale"])
    .index("by_status", ["status", "updatedAt"]),
};
