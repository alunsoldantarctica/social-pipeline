/**
 * Content Pipeline Admin Functions
 *
 * Queries and mutations for managing article workflows.
 * Includes approval handlers that send events to running workflows.
 */

import { v } from "convex/values";
import {
  internalQuery,
  internalMutation,
} from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { uniqueSlug } from "../lib/slugify";
import { sanitizeDraft, validateDraftForPublication } from "../agents/draftSanitize";
import {
  estimateAgentCost,
  estimateArticleWorkflowCost,
  getContentBudgetSettings,
  multiplyWorkflowEstimate,
  type AgentKey,
} from "../agents/costs";
import { workflowManager } from "../workflows";
import type { WorkflowId } from "@convex-dev/workflow";
import {
  researchApprovalEvent,
  outlineApprovalEvent,
  draftApprovalEvent,
} from "../workflows/events";
import { adminQuery, adminMutation } from "../lib/adminAuth";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

async function buildWorkflowCostEstimate(ctx: DbCtx) {
  const estimate = await estimateArticleWorkflowCost(ctx.db);
  return {
    totalEstimatedCostCents: estimate.totalEstimatedCostCents,
    maxAllowedCostCents: estimate.maxAllowedCostCents,
    currency: estimate.currency,
    stages: estimate.stages,
  };
}

async function assertWorkflowBudget(ctx: DbCtx) {
  const estimate = await buildWorkflowCostEstimate(ctx);
  if (estimate.totalEstimatedCostCents > estimate.maxAllowedCostCents) {
    throw new Error(
      `Content workflow cost estimate $${(estimate.totalEstimatedCostCents / 100).toFixed(2)} exceeds cap $${(estimate.maxAllowedCostCents / 100).toFixed(2)}. Update contentPipeline budget settings before starting.`,
    );
  }
  return estimate;
}

// ===== QUERIES =====

/**
 * List all article workflows with optional status filter
 */
export const list = adminQuery({
  args: {
    status: v.optional(
      v.union(
        v.literal("research_in_progress"),
        v.literal("research_review"),
        v.literal("outline_in_progress"),
        v.literal("outline_review"),
        v.literal("draft_in_progress"),
        v.literal("draft_review"),
        v.literal("completed"),
        v.literal("rejected")
      )
    ),
  },
  handler: async (ctx, { status }) => {
    const workflows = status
      ? await ctx.db.query("articleWorkflows")
          .withIndex("by_status", (q) => q.eq("status", status))
          .collect()
      : await ctx.db.query("articleWorkflows").collect();
    return workflows.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/**
 * Get a single workflow by ID
 */
export const get = internalQuery({
  args: { id: v.id("articleWorkflows") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/**
 * Get workflow by ID (public query for admin panel)
 */
export const getById = adminQuery({
  args: { id: v.id("articleWorkflows") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/**
 * Count workflows pending review
 */
export const getPendingCount = adminQuery({
  args: {},
  handler: async (ctx) => {
    const reviewStatuses = [
      "research_review",
      "outline_review",
      "draft_review",
    ] as const;

    let count = 0;
    for (const status of reviewStatuses) {
      const workflows = await ctx.db
        .query("articleWorkflows")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      count += workflows.length;
    }

    return count;
  },
});

/**
 * Estimate one or more article workflows against current model config.
 * Used by CLI/admin preflight before starting batch generation.
 */
export const estimateBatch = adminQuery({
  args: {
    count: v.optional(v.number()),
  },
  handler: async (ctx, { count }) => {
    const workflowEstimate = await estimateArticleWorkflowCost(ctx.db);
    return multiplyWorkflowEstimate(workflowEstimate, count ?? 1);
  },
});

export const getBudgetSettings = adminQuery({
  args: {},
  handler: async (ctx) => {
    return await getContentBudgetSettings(ctx.db);
  },
});

export const updateBudgetSettings = adminMutation({
  args: {
    maxWorkflowCostCents: v.number(),
    maxBatchCostCents: v.number(),
    requireBudgetPreflight: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "contentPipeline"))
      .first();
    const patch = {
      key: "contentPipeline",
      contentMaxWorkflowCostCents: args.maxWorkflowCostCents,
      contentMaxBatchCostCents: args.maxBatchCostCents,
      contentRequireBudgetPreflight: args.requireBudgetPreflight ?? true,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("siteSettings", patch);
  },
});

/**
 * Get the last feedback for a stage
 */
export const getLastFeedback = internalQuery({
  args: {
    id: v.id("articleWorkflows"),
    stage: v.string(),
  },
  handler: async (ctx, { id, stage }) => {
    const workflow = await ctx.db.get(id);
    if (!workflow) return undefined;

    const stageFeedback = workflow.feedbackHistory
      .filter((f) => f.stage === stage && f.feedback)
      .pop();

    return stageFeedback?.feedback;
  },
});

// ===== INTERNAL MUTATIONS (called by workflow) =====

/**
 * Update workflow status
 */
export const getWorkflow = internalQuery({
  args: { id: v.id("articleWorkflows") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const updateStatus = internalMutation({
  args: {
    id: v.id("articleWorkflows"),
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
  },
  handler: async (ctx, { id, status }) => {
    await ctx.db.patch(id, {
      status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Save research output
 */
export const saveResearchOutput = internalMutation({
  args: {
    id: v.id("articleWorkflows"),
    output: v.object({
      sources: v.array(
        v.object({
          url: v.string(),
          title: v.string(),
          summary: v.string(),
        })
      ),
      summary: v.string(),
      suggestedAngles: v.array(v.string()),
    }),
  },
  handler: async (ctx, { id, output }) => {
    await ctx.db.patch(id, {
      researchOutput: output,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Save outline output
 */
export const saveOutlineOutput = internalMutation({
  args: {
    id: v.id("articleWorkflows"),
    output: v.object({
      title: v.string(),
      sections: v.array(
        v.object({
          heading: v.string(),
          keyPoints: v.array(v.string()),
          subsections: v.optional(
            v.array(
              v.object({
                heading: v.string(),
                keyPoints: v.array(v.string()),
              })
            )
          ),
        })
      ),
      targetWordCount: v.number(),
    }),
  },
  handler: async (ctx, { id, output }) => {
    await ctx.db.patch(id, {
      outlineOutput: output,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Save draft output
 */
export const saveDraftOutput = internalMutation({
  args: {
    id: v.id("articleWorkflows"),
    output: v.object({
      content: v.string(),
      metaDescription: v.string(),
      estimatedReadTime: v.number(),
    }),
  },
  handler: async (ctx, { id, output }) => {
    const safety = validateDraftForPublication(output.content);
    await ctx.db.patch(id, {
      draftOutput: output,
      contentSafetyWarnings: [
        ...safety.blockingErrors,
        ...safety.warnings,
      ],
      updatedAt: Date.now(),
    });
  },
});

export const logAiUsage = internalMutation({
  args: {
    workflowRecordId: v.optional(v.id("articleWorkflows")),
    stage: v.union(
      v.literal("research"),
      v.literal("outline"),
      v.literal("draft"),
      v.literal("translate"),
      v.literal("competitor-tagger"),
      v.literal("brief-generator"),
    ),
    provider: v.union(v.literal("google"), v.literal("openrouter"), v.literal("workers-ai")),
    model: v.string(),
    source: v.union(v.literal("ai-sdk"), v.literal("gateway-analytics"), v.literal("estimate")),
    inputTokens: v.number(),
    outputTokens: v.number(),
  },
  handler: async (ctx, args) => {
    const estimated = await estimateAgentCost(ctx.db, args.stage as AgentKey, {
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
    });
    return await ctx.db.insert("aiUsageEvents", {
      workflowRecordId: args.workflowRecordId,
      stage: args.stage,
      provider: args.provider,
      model: args.model,
      source: args.source,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens: args.inputTokens + args.outputTokens,
      estimatedCostCents: estimated.estimatedCostCents,
      createdAt: Date.now(),
    });
  },
});

/**
 * Record social publish status (Zernio) on a workflow.
 * Called from convex/admin/zernioPublish.ts:publishWorkflow.
 */
export const setSocialPublishStatus = internalMutation({
  args: {
    id: v.id("articleWorkflows"),
    socialPublish: v.object({
      status: v.union(
        v.literal("pending"),
        v.literal("published"),
        v.literal("failed"),
        v.literal("skipped"),
      ),
      provider: v.union(v.literal("zernio"), v.literal("resend")),
      profileIds: v.optional(v.array(v.string())),
      postIds: v.optional(v.array(v.string())),
      scheduledAt: v.optional(v.number()),
      publishedAt: v.optional(v.number()),
      attemptedAt: v.optional(v.number()),
      error: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { id, socialPublish }) => {
    await ctx.db.patch(id, {
      socialPublish,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Log feedback to history
 */
export const logFeedback = internalMutation({
  args: {
    id: v.id("articleWorkflows"),
    stage: v.string(),
    action: v.union(v.literal("approve"), v.literal("revise"), v.literal("reject")),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, { id, stage, action, feedback }) => {
    const workflow = await ctx.db.get(id);
    if (!workflow) throw new Error("Workflow not found");

    await ctx.db.patch(id, {
      feedbackHistory: [
        ...workflow.feedbackHistory,
        {
          stage,
          action,
          feedback,
          timestamp: Date.now(),
        },
      ],
      updatedAt: Date.now(),
    });
  },
});

/**
 * Set the selected research angle
 */
export const setSelectedAngle = internalMutation({
  args: {
    id: v.id("articleWorkflows"),
    angle: v.string(),
  },
  handler: async (ctx, { id, angle }) => {
    const workflow = await ctx.db.get(id);
    if (!workflow?.researchOutput) throw new Error("Research output not found");

    await ctx.db.patch(id, {
      researchOutput: {
        ...workflow.researchOutput,
        selectedAngle: angle,
      },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Set thread ID for workflow
 */
export const setThreadId = internalMutation({
  args: {
    id: v.id("articleWorkflows"),
    threadId: v.string(),
  },
  handler: async (ctx, { id, threadId }) => {
    await ctx.db.patch(id, {
      threadId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Increment revision count for a stage
 */
export const incrementRevision = internalMutation({
  args: {
    id: v.id("articleWorkflows"),
    stage: v.union(v.literal("research"), v.literal("outline"), v.literal("draft")),
  },
  handler: async (ctx, { id, stage }) => {
    const workflow = await ctx.db.get(id);
    if (!workflow) throw new Error("Workflow not found");

    await ctx.db.patch(id, {
      revisionCount: {
        ...workflow.revisionCount,
        [stage]: workflow.revisionCount[stage] + 1,
      },
      updatedAt: Date.now(),
    });
  },
});

/**
 * Create blog post from completed draft
 */
export const createBlogPost = internalMutation({
  args: {
    workflowRecordId: v.id("articleWorkflows"),
    finalContent: v.string(),
    scheduledPublishAt: v.optional(v.number()),
  },
  handler: async (ctx, { workflowRecordId, finalContent, scheduledPublishAt }) => {
    const workflow = await ctx.db.get(workflowRecordId);
    if (!workflow?.outlineOutput || !workflow?.draftOutput) {
      throw new Error("Missing outline or draft output");
    }

    // Generate unique slug from title (checks DB for conflicts)
    const slug = await uniqueSlug(ctx.db, workflow.outlineOutput.title);

    const now = Date.now();

    // Sanitize: strip leading H1 (#5), replace [Current Date] tokens (#7),
    // strip competitor marketplace links (#3). Log warnings when a rule fires.
    const { content: sanitized, warnings } = sanitizeDraft(finalContent);
    const safety = validateDraftForPublication(sanitized);
    if (safety.blockingErrors.length > 0) {
      await ctx.db.patch(workflowRecordId, {
        contentSafetyWarnings: [
          ...warnings,
          ...safety.blockingErrors,
          ...safety.warnings,
        ],
        updatedAt: now,
      });
      throw new Error(`Draft failed publication safety checks: ${safety.blockingErrors.join("; ")}`);
    }
    if (warnings.length > 0) {
      await ctx.db.patch(workflowRecordId, {
        contentSafetyWarnings: [
          ...warnings,
          ...safety.warnings,
        ],
        updatedAt: now,
      });
      console.warn(
        `[contentPipeline] draft sanitizer fired for workflow ${workflowRecordId}:`,
        warnings.join("; "),
      );
    }

    // Resolve the placeholder hero image: prefer the configured default in
    // siteSettings (key="media"); fall back to a built-in Cloudflare Images
    // path so the blog post still renders if no setting is saved.
    const mediaSettings = await ctx.db
      .query("siteSettings")
      .withIndex("by_key", (q) => q.eq("key", "media"))
      .first();
    const imagesHash = process.env.CLOUDFLARE_IMAGES_HASH ?? "8QkloevzOQ4esN7rTdpXmg";
    const heroImageId =
      mediaSettings?.defaultBlogHeroImageId ?? "placeholder-hero";
    const placeholderHero = `https://imagedelivery.net/${imagesHash}/${heroImageId}/large`;

    // Create the blog post
    const blogPostId = await ctx.db.insert("blogPosts", {
      title: workflow.outlineOutput.title,
      slug,
      excerpt: workflow.draftOutput.metaDescription,
      content: sanitized,
      category: "Guides",
      readTimeMinutes: workflow.draftOutput.estimatedReadTime,
      imageUrl: placeholderHero,
      isPublished: false,
      scheduledPublishAt,
      podId: workflow.podId,
      createdAt: now,
      updatedAt: now,
    });

    // If scheduledPublishAt provided, schedule the publish function
    if (scheduledPublishAt && scheduledPublishAt > now) {
      const scheduledFunctionId = await ctx.scheduler.runAt(
        scheduledPublishAt,
        internal.blogPosts._publishScheduled,
        { id: blogPostId },
      );

      await ctx.db.patch(blogPostId, {
        scheduledFunctionId: scheduledFunctionId as unknown as string,
      });
    }

    // Link blog post to workflow
    await ctx.db.patch(workflowRecordId, {
      blogPostId,
      updatedAt: now,
    });

    // Flip the source brief (if any) to completed + link the published post
    const brief = await ctx.db
      .query("contentBriefs")
      .withIndex("by_workflow", (q) => q.eq("articleWorkflowId", workflowRecordId))
      .first();
    if (brief) {
      await ctx.db.patch(brief._id, {
        status: "completed",
        blogPostId,
        updatedAt: now,
      });
    }

    return blogPostId;
  },
});

// ===== ADMIN MUTATIONS (called by admin panel) =====

/**
 * Create a new article workflow and start the pipeline
 */
export const create = adminMutation({
  args: {
    topic: v.string(),
    keywords: v.array(v.string()),
    targetAudience: v.string(),
    podId: v.optional(v.id("contentPods")),
    fromBriefId: v.optional(v.id("contentBriefs")),
    outputFormat: v.optional(v.union(
      v.literal("blog_post"),
      v.literal("twitter_thread"),
      v.literal("linkedin_article"),
      v.literal("newsletter_issue"),
    )),
  },
  handler: async (ctx, { topic, keywords, targetAudience, podId, fromBriefId, outputFormat }) => {
    const now = Date.now();
    const costEstimate = await assertWorkflowBudget(ctx);

    // Create the workflow record
    const workflowRecordId = await ctx.db.insert("articleWorkflows", {
      topic,
      keywords,
      targetAudience,
      status: "research_in_progress",
      outputFormat,
      feedbackHistory: [],
      revisionCount: {
        research: 0,
        outline: 0,
        draft: 0,
      },
      costEstimate,
      podId,
      createdAt: now,
      updatedAt: now,
    });

    // Start the workflow - returns workflowId directly
    const workflowId = await workflowManager.start(
      ctx,
      internal.workflows.contentPipeline.contentPipelineWorkflow,
      {
        workflowRecordId,
        topic,
        keywords,
        targetAudience,
      }
    );

    // Save workflow ID
    await ctx.db.patch(workflowRecordId, {
      workflowId,
    });

    // Link brief → workflow if this was triggered from a brief.
    if (fromBriefId) {
      await ctx.db.patch(fromBriefId, {
        articleWorkflowId: workflowRecordId,
        status: "sent_to_pipeline",
        updatedAt: now,
      });
    }

    return workflowRecordId;
  },
});

/**
 * Trigger the research pipeline for an existing brief. Pulls topic/keywords
 * from the brief, inherits its podId, links the created workflow back to the
 * brief, and flips brief status to "sent_to_pipeline".
 */
export const triggerResearchFromBrief = adminMutation({
  args: { briefId: v.id("contentBriefs") },
  handler: async (ctx, { briefId }) => {
    const brief = await ctx.db.get(briefId);
    if (!brief) throw new Error("Brief not found");
    if (brief.articleWorkflowId) {
      throw new Error("Brief already has a workflow — check the Pipeline tab");
    }

    const now = Date.now();
    const costEstimate = await assertWorkflowBudget(ctx);
    const workflowRecordId = await ctx.db.insert("articleWorkflows", {
      topic: brief.topic,
      keywords: brief.keywords,
      targetAudience: brief.targetAudience,
      status: "research_in_progress",
      feedbackHistory: [],
      revisionCount: { research: 0, outline: 0, draft: 0 },
      costEstimate,
      podId: brief.podId,
      createdAt: now,
      updatedAt: now,
    });

    const workflowId = await workflowManager.start(
      ctx,
      internal.workflows.contentPipeline.contentPipelineWorkflow,
      {
        workflowRecordId,
        topic: brief.topic,
        keywords: brief.keywords,
        targetAudience: brief.targetAudience,
      }
    );

    await ctx.db.patch(workflowRecordId, { workflowId });
    await ctx.db.patch(briefId, {
      articleWorkflowId: workflowRecordId,
      status: "sent_to_pipeline",
      updatedAt: now,
    });

    return workflowRecordId;
  },
});

/**
 * Approve research with selected angle
 */
export const approveResearch = adminMutation({
  args: {
    id: v.id("articleWorkflows"),
    selectedAngle: v.string(),
  },
  handler: async (ctx, { id, selectedAngle }) => {
    const workflow = await ctx.db.get(id);
    if (!workflow?.workflowId) throw new Error("Workflow ID not found");
    if (workflow.status !== "research_review") {
      throw new Error("Workflow not in research_review status");
    }

    await workflowManager.sendEvent(ctx, {
      ...researchApprovalEvent,
      workflowId: workflow.workflowId as WorkflowId,
      value: { action: "approve" as const, selectedAngle },
    });
  },
});

/**
 * Request research revision
 */
export const reviseResearch = adminMutation({
  args: {
    id: v.id("articleWorkflows"),
    feedback: v.string(),
  },
  handler: async (ctx, { id, feedback }) => {
    const workflow = await ctx.db.get(id);
    if (!workflow?.workflowId) throw new Error("Workflow ID not found");
    if (workflow.status !== "research_review") {
      throw new Error("Workflow not in research_review status");
    }

    await workflowManager.sendEvent(ctx, {
      ...researchApprovalEvent,
      workflowId: workflow.workflowId as WorkflowId,
      value: { action: "revise" as const, feedback },
    });
  },
});

/**
 * Reject research
 */
export const rejectResearch = adminMutation({
  args: {
    id: v.id("articleWorkflows"),
    reason: v.string(),
  },
  handler: async (ctx, { id, reason }) => {
    const workflow = await ctx.db.get(id);
    if (!workflow?.workflowId) throw new Error("Workflow ID not found");
    if (workflow.status !== "research_review") {
      throw new Error("Workflow not in research_review status");
    }

    await workflowManager.sendEvent(ctx, {
      ...researchApprovalEvent,
      workflowId: workflow.workflowId as WorkflowId,
      value: { action: "reject" as const, reason },
    });
  },
});

/**
 * Approve outline (optionally with edits)
 */
export const approveOutline = adminMutation({
  args: {
    id: v.id("articleWorkflows"),
    editedOutline: v.optional(v.object({
      title: v.string(),
      sections: v.array(v.object({
        heading: v.string(),
        keyPoints: v.array(v.string()),
        subsections: v.optional(v.array(v.object({
          heading: v.string(),
          keyPoints: v.array(v.string()),
        }))),
      })),
      targetWordCount: v.number(),
    })),
  },
  handler: async (ctx, { id, editedOutline }) => {
    const workflow = await ctx.db.get(id);
    if (!workflow?.workflowId) throw new Error("Workflow ID not found");
    if (workflow.status !== "outline_review") {
      throw new Error("Workflow not in outline_review status");
    }

    if (editedOutline) {
      await ctx.db.patch(id, { outlineOutput: editedOutline, updatedAt: Date.now() });
    }

    await workflowManager.sendEvent(ctx, {
      ...outlineApprovalEvent,
      workflowId: workflow.workflowId as WorkflowId,
      value: { action: "approve" as const },
    });
  },
});

/**
 * Request outline revision
 */
export const reviseOutline = adminMutation({
  args: {
    id: v.id("articleWorkflows"),
    feedback: v.string(),
  },
  handler: async (ctx, { id, feedback }) => {
    const workflow = await ctx.db.get(id);
    if (!workflow?.workflowId) throw new Error("Workflow ID not found");
    if (workflow.status !== "outline_review") {
      throw new Error("Workflow not in outline_review status");
    }

    await workflowManager.sendEvent(ctx, {
      ...outlineApprovalEvent,
      workflowId: workflow.workflowId as WorkflowId,
      value: { action: "revise" as const, feedback },
    });
  },
});

/**
 * Reject outline
 */
export const rejectOutline = adminMutation({
  args: {
    id: v.id("articleWorkflows"),
    reason: v.string(),
  },
  handler: async (ctx, { id, reason }) => {
    const workflow = await ctx.db.get(id);
    if (!workflow?.workflowId) throw new Error("Workflow ID not found");
    if (workflow.status !== "outline_review") {
      throw new Error("Workflow not in outline_review status");
    }

    await workflowManager.sendEvent(ctx, {
      ...outlineApprovalEvent,
      workflowId: workflow.workflowId as WorkflowId,
      value: { action: "reject" as const, reason },
    });
  },
});

/**
 * Approve draft (optionally with edits)
 */
export const approveDraft = adminMutation({
  args: {
    id: v.id("articleWorkflows"),
    editedContent: v.optional(v.string()),
    scheduledPublishAt: v.optional(v.number()),
  },
  handler: async (ctx, { id, editedContent, scheduledPublishAt }) => {
    const workflow = await ctx.db.get(id);
    if (!workflow?.workflowId) throw new Error("Workflow ID not found");
    if (workflow.status !== "draft_review") {
      throw new Error("Workflow not in draft_review status");
    }

    await workflowManager.sendEvent(ctx, {
      ...draftApprovalEvent,
      workflowId: workflow.workflowId as WorkflowId,
      value: { action: "approve" as const, editedContent, scheduledPublishAt },
    });
  },
});

/**
 * Request draft revision
 */
export const reviseDraft = adminMutation({
  args: {
    id: v.id("articleWorkflows"),
    feedback: v.string(),
  },
  handler: async (ctx, { id, feedback }) => {
    const workflow = await ctx.db.get(id);
    if (!workflow?.workflowId) throw new Error("Workflow ID not found");
    if (workflow.status !== "draft_review") {
      throw new Error("Workflow not in draft_review status");
    }

    await workflowManager.sendEvent(ctx, {
      ...draftApprovalEvent,
      workflowId: workflow.workflowId as WorkflowId,
      value: { action: "revise" as const, feedback },
    });
  },
});

/**
 * Reject draft
 */
export const rejectDraft = adminMutation({
  args: {
    id: v.id("articleWorkflows"),
    reason: v.string(),
  },
  handler: async (ctx, { id, reason }) => {
    const workflow = await ctx.db.get(id);
    if (!workflow?.workflowId) throw new Error("Workflow ID not found");
    if (workflow.status !== "draft_review") {
      throw new Error("Workflow not in draft_review status");
    }

    await workflowManager.sendEvent(ctx, {
      ...draftApprovalEvent,
      workflowId: workflow.workflowId as WorkflowId,
      value: { action: "reject" as const, reason },
    });
  },
});

/**
 * Delete a workflow (removes it completely)
 */
export const deleteWorkflow = adminMutation({
  args: {
    id: v.id("articleWorkflows"),
  },
  handler: async (ctx, { id }) => {
    const workflow = await ctx.db.get(id);
    if (!workflow) throw new Error("Workflow not found");

    // Cancel any running workflow
    if (workflow.workflowId) {
      try {
        await workflowManager.cancel(ctx, workflow.workflowId as WorkflowId);
      } catch {
        // Workflow may already be completed/cancelled
      }
    }

    await ctx.db.delete(id);
    return { deleted: true, topic: workflow.topic };
  },
});

/**
 * Delete all workflows with a specific status
 */
export const deleteByStatus = adminMutation({
  args: {
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
  },
  handler: async (ctx, { status }) => {
    const workflows = await ctx.db
      .query("articleWorkflows")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect();

    let deleted = 0;
    for (const workflow of workflows) {
      if (workflow.workflowId) {
        try {
          await workflowManager.cancel(ctx, workflow.workflowId as WorkflowId);
        } catch {
          // Workflow may already be completed/cancelled
        }
      }
      await ctx.db.delete(workflow._id);
      deleted++;
    }

    return { deleted, status };
  },
});

/**
 * Retry a stuck or rejected workflow from the beginning.
 * Cancels any existing workflow and starts fresh.
 */
export const retryWorkflow = adminMutation({
  args: {
    id: v.id("articleWorkflows"),
  },
  handler: async (ctx, { id }) => {
    const workflow = await ctx.db.get(id);
    if (!workflow) throw new Error("Workflow not found");

    // Cancel old workflow if it exists
    if (workflow.workflowId) {
      try {
        await workflowManager.cancel(ctx, workflow.workflowId as WorkflowId);
      } catch {
        // Workflow may already be completed/cancelled
      }
    }

    const now = Date.now();

    // Replace the entire document to clear optional fields
    await ctx.db.replace(id, {
      topic: workflow.topic,
      keywords: workflow.keywords,
      targetAudience: workflow.targetAudience,
      status: "research_in_progress",
      feedbackHistory: workflow.feedbackHistory,
      revisionCount: { research: 0, outline: 0, draft: 0 },
      createdAt: workflow.createdAt,
      updatedAt: now,
    });

    // Start a new workflow
    const workflowId = await workflowManager.start(
      ctx,
      internal.workflows.contentPipeline.contentPipelineWorkflow,
      {
        workflowRecordId: id,
        topic: workflow.topic,
        keywords: workflow.keywords,
        targetAudience: workflow.targetAudience,
      }
    );

    await ctx.db.patch(id, { workflowId, updatedAt: now });

    return { retried: true, topic: workflow.topic };
  },
});

/**
 * Aggregate AI usage stats by model and stage.
 * Used for cost statistics across the content pipeline.
 */
export const getUsageStats = adminQuery({
  args: {
    since: v.optional(v.number()), // unix ms — defaults to all time
  },
  handler: async (ctx, { since }) => {
    const events = await ctx.db.query("aiUsageEvents").collect();
    const filtered = since ? events.filter((e) => e.createdAt >= since) : events;

    // Aggregate by provider+model
    const byModel: Record<
      string,
      {
        provider: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCostCents: number;
        callCount: number;
        byStage: Record<string, { inputTokens: number; outputTokens: number; estimatedCostCents: number; callCount: number }>;
      }
    > = {};

    for (const event of filtered) {
      const key = `${event.provider}/${event.model}`;
      if (!byModel[key]) {
        byModel[key] = {
          provider: event.provider,
          model: event.model,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostCents: 0,
          callCount: 0,
          byStage: {},
        };
      }
      const row = byModel[key];
      row.inputTokens += event.inputTokens;
      row.outputTokens += event.outputTokens;
      row.totalTokens += event.totalTokens;
      row.estimatedCostCents += event.estimatedCostCents;
      row.callCount += 1;

      if (!row.byStage[event.stage]) {
        row.byStage[event.stage] = { inputTokens: 0, outputTokens: 0, estimatedCostCents: 0, callCount: 0 };
      }
      row.byStage[event.stage].inputTokens += event.inputTokens;
      row.byStage[event.stage].outputTokens += event.outputTokens;
      row.byStage[event.stage].estimatedCostCents += event.estimatedCostCents;
      row.byStage[event.stage].callCount += 1;
    }

    const totalCostCents = filtered.reduce((s, e) => s + e.estimatedCostCents, 0);
    const totalTokens = filtered.reduce((s, e) => s + e.totalTokens, 0);

    return {
      totalCostCents,
      totalTokens,
      eventCount: filtered.length,
      byModel: Object.values(byModel).sort((a, b) => b.estimatedCostCents - a.estimatedCostCents),
    };
  },
});
