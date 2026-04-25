import type { MutationCtx } from "../types";

// Legacy posts predate pod tagging through articleWorkflows — assign by
// hand based on slug/topic. Idempotent: only patches posts that currently
// have no podId.
const SLUG_TO_POD: Record<string, string> = {
  "cfar-vs-standard-travel-insurance-protecting-high-stakes-polar-safari-expeditions-from-total-loss": "cfar-expedition",
  "stuck-in-the-ice-what-happens-when-your-expedition-ship-gets-trapped-and-how-insurance-can-help": "expedition-cruise",
  "don-t-get-stranded-why-your-chase-sapphire-reserve-isn-t-enough-for-antarctica-expedition-insurance": "antarctic-polar",
  "expedition-cruise-cancellation-costs": "expedition-cruise",
  "arctic-expedition-insurance-svalbard-greenland": "antarctic-polar",
  "safari-insurance-amref-flying-doctors": "african-safari",
  "operator-requirements-comparison": "antarctic-polar",
  "break-leg-south-georgia-evacuation": "antarctic-polar",
  "medical-evacuation-insurance-antarctica": "antarctic-polar",
};

export async function handler(ctx: MutationCtx): Promise<string> {
  const pods = await ctx.db.query("contentPods").collect();
  const podIdBySlug = new Map(pods.map((p: any) => [p.slug, p._id]));

  let updated = 0;
  let skipped = 0;
  const missingSlugs: string[] = [];

  for (const [slug, podSlug] of Object.entries(SLUG_TO_POD)) {
    const post = await ctx.db
      .query("blogPosts")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .first();
    if (!post) { skipped++; continue; }
    if (post.podId) { skipped++; continue; }
    const podId = podIdBySlug.get(podSlug);
    if (!podId) { missingSlugs.push(podSlug); skipped++; continue; }
    await ctx.db.patch(post._id, { podId, updatedAt: Date.now() });
    updated++;
  }

  return `Legacy pod backfill: ${updated} updated, ${skipped} skipped${missingSlugs.length ? `, missing pods: ${missingSlugs.join(",")}` : ""}`;
}
