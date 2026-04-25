/**
 * Content Calendar
 *
 * Schedule and track content production from briefs through publication.
 * Bridges contentBriefs → articleWorkflows → blogPosts with scheduling.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { workflowManager } from "../workflows";

// ========================================
// MUTATIONS
// ========================================

export const schedule = mutation({
  args: {
    briefId: v.optional(v.id("contentBriefs")),
    topic: v.string(),
    targetKeyword: v.string(),
    scheduledPublishDate: v.number(),
    priority: v.number(),
    contentType: v.union(v.literal("blog"), v.literal("landing_page")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("contentCalendar", {
      briefId: args.briefId,
      topic: args.topic,
      targetKeyword: args.targetKeyword,
      scheduledPublishDate: args.scheduledPublishDate,
      status: "planned",
      priority: args.priority,
      contentType: args.contentType,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("contentCalendar"),
    status: v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("ready"),
      v.literal("published"),
    ),
  },
  handler: async (ctx, { id, status }) => {
    await ctx.db.patch(id, { status, updatedAt: Date.now() });
  },
});

export const linkWorkflow = mutation({
  args: {
    id: v.id("contentCalendar"),
    articleWorkflowId: v.id("articleWorkflows"),
  },
  handler: async (ctx, { id, articleWorkflowId }) => {
    await ctx.db.patch(id, {
      articleWorkflowId,
      status: "in_progress",
      updatedAt: Date.now(),
    });
  },
});

export const linkBlogPost = mutation({
  args: {
    id: v.id("contentCalendar"),
    blogPostId: v.id("blogPosts"),
  },
  handler: async (ctx, { id, blogPostId }) => {
    await ctx.db.patch(id, {
      blogPostId,
      status: "ready",
      updatedAt: Date.now(),
    });
  },
});

export const markPublished = mutation({
  args: { id: v.id("contentCalendar") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, {
      status: "published",
      updatedAt: Date.now(),
    });
  },
});

export const reschedule = mutation({
  args: {
    id: v.id("contentCalendar"),
    scheduledPublishDate: v.number(),
  },
  handler: async (ctx, { id, scheduledPublishDate }) => {
    await ctx.db.patch(id, {
      scheduledPublishDate,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("contentCalendar") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

// ========================================
// BULK SCHEDULING (from gap analysis)
// ========================================

export const bulkScheduleFromBriefs = mutation({
  args: {
    startDate: v.number(),
    intervalDays: v.number(),
    contentType: v.union(v.literal("blog"), v.literal("landing_page")),
  },
  handler: async (ctx, { startDate, intervalDays, contentType }) => {
    const briefs = await ctx.db
      .query("contentBriefs")
      .withIndex("by_status", (q) => q.eq("status", "generated"))
      .collect();

    const now = Date.now();
    let scheduled = 0;

    for (const brief of briefs) {
      const publishDate = startDate + scheduled * intervalDays * 86400000;
      await ctx.db.insert("contentCalendar", {
        briefId: brief._id,
        topic: brief.topic,
        targetKeyword: brief.keywords[0] || brief.topic,
        scheduledPublishDate: publishDate,
        status: "planned",
        priority: scheduled < 5 ? 1 : scheduled < 15 ? 2 : 3,
        contentType,
        createdAt: now,
        updatedAt: now,
      });
      scheduled++;
    }

    return { scheduled };
  },
});

// ========================================
// BATCH APPROVE (kick off article pipeline)
// ========================================

export const batchApprove = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const planned = await ctx.db
      .query("contentCalendar")
      .withIndex("by_status", (q) => q.eq("status", "planned"))
      .take(limit || 10);

    const now = Date.now();
    let approved = 0;

    for (const item of planned) {
      const brief = item.briefId ? await ctx.db.get(item.briefId) : null;
      const topic = item.topic;
      const keywords = brief?.keywords || [item.targetKeyword];
      const targetAudience = brief?.targetAudience || "Travel insurance shoppers planning polar expeditions or African safaris";

      // Create the workflow record with target publish date
      const workflowRecordId = await ctx.db.insert("articleWorkflows", {
        topic,
        keywords,
        targetAudience,
        status: "research_in_progress",
        feedbackHistory: [],
        revisionCount: { research: 0, outline: 0, draft: 0 },
        scheduledPublishAt: item.scheduledPublishDate,
        createdAt: now,
        updatedAt: now,
      });

      // Start the actual Convex Workflow engine (research → outline → draft)
      const wfId = await workflowManager.start(
        ctx,
        internal.workflows.contentPipeline.contentPipelineWorkflow,
        { workflowRecordId, topic, keywords, targetAudience }
      );
      await ctx.db.patch(workflowRecordId, { workflowId: wfId });

      // Update calendar entry
      await ctx.db.patch(item._id, {
        articleWorkflowId: workflowRecordId,
        status: "in_progress",
        updatedAt: now,
      });

      // Update brief status if linked
      if (brief && brief.status === "generated") {
        await ctx.db.patch(brief._id, {
          status: "sent_to_pipeline",
          articleWorkflowId: workflowRecordId,
          updatedAt: now,
        });
      }

      approved++;
    }

    return { approved };
  },
});

/**
 * Backfill scheduledPublishAt from calendar entries to their linked workflows.
 * Usage: pnpx convex run admin/contentCalendar:backfillDates '{}'
 */
export const backfillDates = mutation({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db
      .query("contentCalendar")
      .withIndex("by_status", (q) => q.eq("status", "in_progress"))
      .collect();

    let updated = 0;
    for (const item of items) {
      if (item.articleWorkflowId && item.scheduledPublishDate) {
        const wf = await ctx.db.get(item.articleWorkflowId);
        if (wf && !wf.scheduledPublishAt) {
          await ctx.db.patch(item.articleWorkflowId, {
            scheduledPublishAt: item.scheduledPublishDate,
            updatedAt: Date.now(),
          });
          updated++;
        }
      }
    }
    return { updated };
  },
});

/**
 * Fix stuck workflows that were created without starting the workflow engine.
 * Usage: pnpx convex run admin/contentCalendar:restartStuckWorkflows '{}'
 */
export const restartStuckWorkflows = mutation({
  args: {},
  handler: async (ctx) => {
    const stuck = await ctx.db
      .query("articleWorkflows")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "research_in_progress"),
          q.eq(q.field("workflowId"), undefined)
        )
      )
      .take(24);

    let restarted = 0;
    for (const wf of stuck) {
      const wfId = await workflowManager.start(
        ctx,
        internal.workflows.contentPipeline.contentPipelineWorkflow,
        {
          workflowRecordId: wf._id,
          topic: wf.topic,
          keywords: wf.keywords,
          targetAudience: wf.targetAudience,
        }
      );
      await ctx.db.patch(wf._id, { workflowId: wfId });
      restarted++;
    }
    return { restarted };
  },
});

// ========================================
// QUERIES
// ========================================

export const list = query({
  args: {
    status: v.optional(v.union(
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("ready"),
      v.literal("published"),
    )),
  },
  handler: async (ctx, { status }) => {
    if (status) {
      return await ctx.db
        .query("contentCalendar")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
    }
    return await ctx.db
      .query("contentCalendar")
      .withIndex("by_date")
      .collect();
  },
});

export const getUpcoming = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const now = Date.now();
    const items = await ctx.db
      .query("contentCalendar")
      .withIndex("by_date", (q) => q.gte("scheduledPublishDate", now))
      .take(limit || 20);

    // Enrich with brief details
    const enriched = await Promise.all(
      items.map(async (item) => {
        const brief = item.briefId
          ? await ctx.db.get(item.briefId)
          : null;
        return { ...item, brief };
      })
    );

    return enriched;
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("contentCalendar").collect();
    const counts = { planned: 0, in_progress: 0, ready: 0, published: 0, total: all.length };
    for (const item of all) {
      counts[item.status]++;
    }
    return counts;
  },
});
