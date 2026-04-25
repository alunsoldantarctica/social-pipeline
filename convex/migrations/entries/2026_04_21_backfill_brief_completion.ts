import type { MutationCtx } from "../types";

export async function handler(ctx: MutationCtx): Promise<string> {
  const briefs = await ctx.db.query("contentBriefs").collect();
  let updated = 0;
  let skipped = 0;

  for (const brief of briefs) {
    if (brief.status === "completed" || !brief.articleWorkflowId) {
      skipped++;
      continue;
    }
    const wf = await ctx.db.get(brief.articleWorkflowId);
    if (!wf || wf.status !== "completed" || !wf.blogPostId) {
      skipped++;
      continue;
    }
    await ctx.db.patch(brief._id, {
      status: "completed",
      blogPostId: wf.blogPostId,
      updatedAt: Date.now(),
    });
    updated++;
  }

  return `Completed ${updated} briefs (skipped ${skipped})`;
}
