import type { MutationCtx } from "../types";

/**
 * Seed default token assumptions used to estimate per-step pipeline cost.
 *
 * Values from EXP-192 spec:
 *   - Research: 5k in / 3k out + 5 web searches
 *   - Outline:  6k in / 2k out
 *   - Draft:   10k in / 4k out + 1 revision (i.e. runs twice)
 *
 * These are editable in /admin/content?tab=models without redeploy via the
 * `catalog/queries:upsertAssumption` mutation.
 */
export async function handler(ctx: MutationCtx): Promise<string> {
  const defaults = [
    { step: "research" as const, inputTokens: 5000, outputTokens: 3000, webSearches: 5 },
    { step: "outline" as const, inputTokens: 6000, outputTokens: 2000 },
    { step: "draft" as const, inputTokens: 10000, outputTokens: 4000, revisions: 1 },
  ];
  const now = Date.now();
  let inserted = 0;
  for (const d of defaults) {
    const existing = await ctx.db
      .query("pipelineCostAssumptions")
      .withIndex("by_step", (q: any) => q.eq("step", d.step))
      .unique();
    if (existing) continue;
    await ctx.db.insert("pipelineCostAssumptions", { ...d, updatedAt: now });
    inserted++;
  }
  return `seeded ${inserted} pipelineCostAssumptions`;
}
