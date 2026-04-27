/**
 * Agent Instructions Resolver
 *
 * Runtime lookup for agent prompts. Reads the `agentInstructions` table for
 * a (stage, format) pair and falls back to the constants in `instructions.ts`
 * / `formatAdapters.ts` when no override exists or `useDefault=true`.
 *
 * The runner calls `resolve` once per stage; the admin UI lets editors
 * override any prompt via convex/admin/agentInstructions.ts without a deploy.
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import {
  researchInstructions,
  outlineInstructions,
  draftInstructions,
} from "./instructions";
import {
  TWITTER_THREAD_INSTRUCTIONS,
  LINKEDIN_ARTICLE_INSTRUCTIONS,
  NEWSLETTER_ISSUE_INSTRUCTIONS,
} from "./formatAdapters";

const stageValidator = v.union(
  v.literal("research"),
  v.literal("outline"),
  v.literal("draft"),
);

const formatValidator = v.union(
  v.literal("twitter_thread"),
  v.literal("linkedin_article"),
  v.literal("newsletter_issue"),
);

type Stage = "research" | "outline" | "draft";
type Format = "twitter_thread" | "linkedin_article" | "newsletter_issue";

export function getDefaultInstruction(stage: Stage, format?: Format): string {
  if (format) {
    switch (format) {
      case "twitter_thread":
        return TWITTER_THREAD_INSTRUCTIONS;
      case "linkedin_article":
        return LINKEDIN_ARTICLE_INSTRUCTIONS;
      case "newsletter_issue":
        return NEWSLETTER_ISSUE_INSTRUCTIONS;
    }
  }
  switch (stage) {
    case "research":
      return researchInstructions;
    case "outline":
      return outlineInstructions;
    case "draft":
      return draftInstructions;
  }
}

/**
 * Resolve the live instruction body for a (stage, format) pair.
 * Returns the DB body when a row exists with `useDefault=false`,
 * otherwise the bundled default constant.
 */
export const resolve = internalQuery({
  args: {
    stage: stageValidator,
    format: v.optional(formatValidator),
  },
  handler: async (ctx, { stage, format }) => {
    const row = await ctx.db
      .query("agentInstructions")
      .withIndex("by_stage_format", (q) =>
        q.eq("stage", stage).eq("format", format),
      )
      .first();
    if (row && !row.useDefault) {
      return row.body;
    }
    return getDefaultInstruction(stage as Stage, format as Format | undefined);
  },
});
