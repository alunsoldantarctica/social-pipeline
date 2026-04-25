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
  // Per-model cost estimates used to project cost before a workflow runs.

  pipelineCostAssumptions: defineTable({
    modelId: v.string(),
    stage: v.string(),
    estimatedInputTokens: v.number(),
    estimatedOutputTokens: v.number(),
    inputCostPerMillionTokens: v.number(),
    outputCostPerMillionTokens: v.number(),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_model_stage", ["modelId", "stage"]),
};
