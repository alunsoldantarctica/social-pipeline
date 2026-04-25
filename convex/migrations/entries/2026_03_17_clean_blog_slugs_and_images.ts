import type { MutationCtx } from "../types";

export async function handler(ctx: MutationCtx): Promise<string> {
  const posts = await ctx.db.query("blogPosts").collect();
  let slugsFixed = 0;
  let imagesFixed = 0;

  for (const post of posts) {
    const patches: Record<string, any> = {};

    // Fix timestamp slugs: strip trailing -XXXXXXXXXXXXX (13 digits)
    const tsMatch = post.slug.match(/^(.+)-\d{13}$/);
    if (tsMatch) {
      let cleanSlug = tsMatch[1];
      const conflict = await ctx.db
        .query("blogPosts")
        .withIndex("by_slug", (q: any) => q.eq("slug", cleanSlug))
        .first();
      if (conflict && conflict._id !== post._id) {
        let counter = 2;
        while (true) {
          const candidate = `${cleanSlug}-${counter}`;
          const c = await ctx.db
            .query("blogPosts")
            .withIndex("by_slug", (q: any) => q.eq("slug", candidate))
            .first();
          if (!c || c._id === post._id) { cleanSlug = candidate; break; }
          counter++;
        }
      }
      patches.slug = cleanSlug;
      slugsFixed++;
    }

    // Fix broken image URLs: placeholder or krill share links
    if (post.imageUrl === "/images/blog/placeholder.jpg") {
      patches.imageUrl = "https://imagedelivery.net/8QkloevzOQ4esN7rTdpXmg/d5822c59-bd6a-4b20-fee8-c90bdba64200/large";
      imagesFixed++;
    } else {
      const krillMatch = post.imageUrl?.match(/^https:\/\/krill\.unsoldantarctica\.com\/m\/([a-f0-9-]+)/);
      if (krillMatch) {
        patches.imageUrl = `https://imagedelivery.net/8QkloevzOQ4esN7rTdpXmg/${krillMatch[1]}/large`;
        imagesFixed++;
      }
    }

    if (Object.keys(patches).length > 0) {
      patches.updatedAt = Date.now();
      await ctx.db.patch(post._id, patches);
    }
  }

  return `${slugsFixed} slugs cleaned, ${imagesFixed} images fixed`;
}
