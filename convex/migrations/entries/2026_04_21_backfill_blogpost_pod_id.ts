import type { MutationCtx } from "../types";

export async function handler(ctx: MutationCtx): Promise<string> {
  const workflows = await ctx.db.query("articleWorkflows").collect();
  let updated = 0;
  let skipped = 0;

  for (const wf of workflows) {
    if (!wf.podId || !wf.blogPostId) {
      skipped++;
      continue;
    }
    const post = await ctx.db.get(wf.blogPostId);
    if (!post || post.podId === wf.podId) {
      skipped++;
      continue;
    }
    await ctx.db.patch(wf.blogPostId, { podId: wf.podId, updatedAt: Date.now() });
    updated++;
  }

  return `Backfilled podId on ${updated} blogPosts (skipped ${skipped})`;
}
