import type { MutationCtx } from "../types";

/**
 * EXP-179: Reclaim drafts stuck in "draft" status > 1 hour.
 *
 * Before the guard fix in _checkDraftAbandoned, drafts with a non-empty email
 * (e.g. patched via duplicate_merged or admin edit) were excluded from
 * abandonment. This backfills them in one sweep.
 *
 * Scope: any quote still in status "draft" whose scheduled abandonment check
 * would have fired by now (creationTime older than 1h).
 */
export async function handler(ctx: MutationCtx): Promise<string> {
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const cutoff = Date.now() - ONE_HOUR_MS;

  const drafts = await ctx.db
    .query("quotes")
    .withIndex("by_status", (q: any) => q.eq("status", "draft"))
    .collect();

  let marked = 0;
  for (const q of drafts) {
    if (q._creationTime >= cutoff) continue;
    await ctx.db.patch(q._id, { status: "abandoned" as const, updatedAt: Date.now() });
    marked++;
  }

  return `Marked ${marked} stuck drafts as abandoned (scanned ${drafts.length})`;
}
