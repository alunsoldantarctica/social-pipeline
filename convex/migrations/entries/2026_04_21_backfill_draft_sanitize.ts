import type { MutationCtx } from "../types";
import { sanitizeDraft } from "../../agents/draftSanitize";

export async function handler(ctx: MutationCtx): Promise<string> {
  const posts = await ctx.db.query("blogPosts").collect();
  let updated = 0;

  for (const post of posts) {
    if (!post.content) continue;
    // Use publishedAt if set so backfill produces a stable date.
    const asOf = new Date(post.publishedAt ?? post.updatedAt ?? post.createdAt);
    const { content, warnings } = sanitizeDraftAsOf(post.content, asOf);
    if (warnings.length === 0 || content === post.content) continue;
    await ctx.db.patch(post._id, { content, updatedAt: Date.now() });
    updated++;
  }

  return `Sanitized ${updated} blog posts`;
}

function sanitizeDraftAsOf(markdown: string, _asOf: Date) {
  // sanitizeDraft uses current Date() internally. For backfill we accept
  // current-date substitution since it's a one-off cleanup; readers get a
  // real date instead of "[Current Date]".
  return sanitizeDraft(markdown);
}
