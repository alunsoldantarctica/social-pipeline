/**
 * Editorial Context Injection
 *
 * Builds the system-level editorial steer that is prepended to every
 * content-pipeline agent prompt (research / outline / draft). Pulls:
 *   1. Active rules from `editorialRules` (grouped by category, ordered)
 *
 * TODO: Add a "live data block" section below to inject dynamic context
 * from your database into every agent prompt — e.g., a list of your
 * active products, featured topics, or competitor brands to avoid.
 * Pattern: query your table → format as a string → append to rulesBlock.
 */

import { internalQuery } from "../_generated/server";

const CATEGORY_HEADINGS: Record<string, string> = {
  commercial: "Commercial / Positioning",
  tone: "Tone & Voice",
  legal: "Legal / Compliance",
  structure: "Structure",
};

const CATEGORY_ORDER: Array<"commercial" | "tone" | "legal" | "structure"> = [
  "commercial",
  "tone",
  "legal",
  "structure",
];

export const build = internalQuery({
  args: {},
  handler: async (ctx): Promise<string> => {
    // 1. Load active editorial rules, grouped by category, ordered.
    const rules = (
      await ctx.db
        .query("editorialRules")
        .withIndex("by_active_order", (q) => q.eq("isActive", true))
        .collect()
    ).sort((a, b) => a.order - b.order);

    const sections: string[] = [];
    for (const category of CATEGORY_ORDER) {
      const group = rules.filter((r) => r.category === category);
      if (group.length === 0) continue;
      const lines = group.map((r, i) => `${i + 1}. ${r.title} — ${r.body}`);
      sections.push(`[${CATEGORY_HEADINGS[category]}]\n${lines.join("\n")}`);
    }

    // 2. TODO: Add your live data block here.
    // Example — inject active product list so agents never reference
    // products you've removed:
    //
    // const products = await ctx.db.query("products")
    //   .withIndex("by_active", (q) => q.eq("isActive", true))
    //   .collect();
    // const productsBlock = products.length > 0
    //   ? `PRODUCTS WE CURRENTLY OFFER:\n${products.map(p => `- ${p.name}`).join("\n")}`
    //   : "";
    //
    // return [rulesBlock, productsBlock].filter(Boolean).join("\n\n");

    const rulesBlock =
      sections.length > 0
        ? `Editorial constraints — follow strictly:\n\n${sections.join("\n\n")}`
        : "";

    return rulesBlock;
  },
});
