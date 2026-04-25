/**
 * Record realised per-step cost on articleWorkflows.
 *
 * Called by the pipeline runner after each generateText call. Looks up the
 * catalog row for pricing, computes the cost from token usage, and patches
 * stepCosts[step] + accumulates actualCostUsd on the workflow.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { actualCallCost } from "./cost";

export const _recordStepCost = internalMutation({
  args: {
    workflowRecordId: v.id("articleWorkflows"),
    step: v.union(
      v.literal("research"),
      v.literal("outline"),
      v.literal("draft"),
    ),
    modelId: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    webSearches: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("modelCatalog")
      .withIndex("by_model_id", (q) => q.eq("id", args.modelId))
      .unique();
    if (!row) {
      // Model not in catalog (e.g. legacy `google/gemini-2.5-flash` direct route).
      // Skip cost tracking — don't fail the pipeline step.
      return { tracked: false, reason: "model not in catalog" };
    }
    const cost = actualCallCost(
      row,
      {
        promptTokens: args.promptTokens,
        completionTokens: args.completionTokens,
      },
      args.webSearches ?? 0,
    );

    const wf = await ctx.db.get(args.workflowRecordId);
    if (!wf) {
      return { tracked: false, reason: "workflow not found" };
    }
    const prev = wf.stepCosts ?? {};
    const stepCosts = { ...prev, [args.step]: cost };
    const actualCostUsd =
      (stepCosts.research ?? 0) +
      (stepCosts.outline ?? 0) +
      (stepCosts.draft ?? 0);
    await ctx.db.patch(args.workflowRecordId, {
      stepCosts,
      actualCostUsd,
      updatedAt: Date.now(),
    });
    return { tracked: true, cost };
  },
});
