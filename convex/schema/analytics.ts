import { defineTable } from "convex/server";
import { v } from "convex/values";

export const analyticsTables = {
  // ===== AI USAGE EVENTS =====
  // Records actual token usage per pipeline step for cost reconciliation.

  aiUsageEvents: defineTable({
    workflowRecordId: v.id("articleWorkflows"),
    stage: v.union(
      v.literal("research"),
      v.literal("outline"),
      v.literal("draft"),
      v.literal("translate"),
      v.literal("competitor-tagger"),
      v.literal("brief-generator"),
    ),
    provider: v.string(),
    model: v.string(),
    source: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    estimatedCostUsd: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_workflow", ["workflowRecordId", "createdAt"])
    .index("by_stage", ["stage", "createdAt"])
    .index("by_model", ["model", "createdAt"]),

  // ===== PIPELINE COST ASSUMPTIONS =====
  // Per-step token estimates used to project cost before a workflow runs.

  pipelineCostAssumptions: defineTable({
    step: v.union(v.literal("research"), v.literal("outline"), v.literal("draft")),
    inputTokens: v.number(),
    outputTokens: v.number(),
    webSearches: v.optional(v.number()),
    revisions: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_step", ["step"]),

  // ===== MODEL CATALOG =====
  // OpenRouter model registry — synced daily, drives the models UI and cost tracking.

  modelCatalog: defineTable({
    id: v.string(),
    displayName: v.string(),
    provider: v.optional(v.string()),
    family: v.optional(v.string()),
    isEnabled: v.boolean(),
    recommendedFor: v.array(v.union(v.literal("research"), v.literal("outline"), v.literal("draft"))),
    promptPrice: v.number(),
    completionPrice: v.number(),
    webSearchPrice: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_model_id", ["id"])
    .index("by_enabled", ["isEnabled"]),
};
