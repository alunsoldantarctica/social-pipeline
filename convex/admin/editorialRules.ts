/**
 * Editorial Rules
 *
 * Source of truth for editorial constraints injected into every content-
 * pipeline prompt (research / outline / draft). Rules are grouped by
 * category (commercial / tone / legal / structure) and ordered within the
 * full set. See convex/agents/editorialContext.ts for prompt injection.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

const categoryValidator = v.union(
  v.literal("commercial"),
  v.literal("tone"),
  v.literal("legal"),
  v.literal("structure"),
);

// ─── Queries ─────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rules = await ctx.db.query("editorialRules").collect();
    return rules.sort((a, b) => a.order - b.order);
  },
});

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const rules = await ctx.db
      .query("editorialRules")
      .withIndex("by_active_order", (q) => q.eq("isActive", true))
      .collect();
    return rules.sort((a, b) => a.order - b.order);
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    category: categoryValidator,
    title: v.string(),
    body: v.string(),
    isActive: v.optional(v.boolean()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let order = args.order;
    if (order === undefined) {
      const all = await ctx.db.query("editorialRules").collect();
      order = all.length > 0 ? Math.max(...all.map((r) => r.order)) + 1 : 0;
    }
    return await ctx.db.insert("editorialRules", {
      category: args.category,
      title: args.title,
      body: args.body,
      isActive: args.isActive ?? true,
      order,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("editorialRules"),
    patch: v.object({
      category: v.optional(categoryValidator),
      title: v.optional(v.string()),
      body: v.optional(v.string()),
      isActive: v.optional(v.boolean()),
      order: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    await ctx.db.patch(id, { ...patch, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("editorialRules") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const toggleActive = mutation({
  args: { id: v.id("editorialRules") },
  handler: async (ctx, { id }) => {
    const rule = await ctx.db.get(id);
    if (!rule) throw new Error("Rule not found");
    await ctx.db.patch(id, { isActive: !rule.isActive, updatedAt: Date.now() });
  },
});

/** Swap a rule's `order` with its neighbor in the given direction. */
export const reorder = mutation({
  args: {
    id: v.id("editorialRules"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, { id, direction }) => {
    const rule = await ctx.db.get(id);
    if (!rule) throw new Error("Rule not found");
    const all = (await ctx.db.query("editorialRules").collect()).sort(
      (a, b) => a.order - b.order,
    );
    const idx = all.findIndex((r) => r._id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= all.length) return;
    const neighbor = all[swapIdx];
    const now = Date.now();
    await ctx.db.patch(rule._id, { order: neighbor.order, updatedAt: now });
    await ctx.db.patch(neighbor._id, { order: rule.order, updatedAt: now });
  },
});

// ─── Seed ────────────────────────────────────────────────────────────────

type SeedRule = {
  category: "commercial" | "tone" | "legal" | "structure";
  title: string;
  body: string;
};

const SEED_RULES: SeedRule[] = [
  // Commercial / positioning
  {
    category: "commercial",
    title: "Recommend only what you can stand behind",
    body: "When a topic calls for a product or service recommendation, recommend only options that are relevant to your niche and audience. Do not recommend competitors or alternatives unless the brief is explicitly a comparison piece.",
  },
  {
    category: "commercial",
    title: "Always include a CTA",
    body: "Every article must include at least one call to action that guides the reader toward a next step — a signup, a product page, a related article, or a newsletter. Make the CTA specific and contextual to the topic.",
  },
  {
    category: "commercial",
    title: "No fabricated premium numbers",
    body: "Never print specific dollar premiums. Prices vary by age, destination, duration. Direct readers to the quote tool instead. Exception: published benchmarks like 'CFAR typically adds 40-50%' are acceptable.",
  },

  // Tone & voice
  {
    category: "tone",
    title: "Informative, not salesy",
    body: "Reader-serving, peer-to-peer expert tone. No fearmongering, no FOMO tactics, no high-pressure language. Assume the reader is sophisticated.",
  },
  {
    category: "tone",
    title: "Expedition traveler framing",
    body: "Our readers travel to Antarctica, the Arctic, safari destinations, and Galapagos — not generic tourists. Assume the reader is spending $5k-$50k+ on a trip. Frame examples and risk scenarios accordingly.",
  },
  {
    category: "tone",
    title: "US English, active voice, short paragraphs",
    body: "Use US English spelling. Prefer active voice. Keep paragraphs short (2-4 sentences). Avoid AI tells: em-dash overuse, 'in today's fast-paced world', rule-of-three abuse, stacked conjunctive phrases ('moreover, furthermore, additionally').",
  },
  {
    category: "tone",
    title: "Define jargon on first use",
    body: "Define insurance jargon the first time it appears: CFAR, primary vs secondary medical, medical evac, pre-existing look-back, deductible, trip interruption, etc.",
  },

  // Legal / compliance
  {
    category: "legal",
    title: "No legal or medical advice",
    body: "Frame content as general information, not legal or medical advice. End articles with a reminder to read the policy and consult the carrier for specific situations.",
  },
  {
    category: "legal",
    title: "Do not promise coverage",
    body: "Never state that a specific scenario 'is covered'. Use conditional language: 'may cover', 'typically covers', 'check your policy for'.",
  },
  {
    category: "legal",
    title: "Disclose role where appropriate",
    body: "We are a licensed travel-insurance producer, not an underwriter. Where context calls for it, make this distinction clear.",
  },

  // Structure
  {
    category: "structure",
    title: "Include 'Who this is for / Who this isn't for'",
    body: "Every article must include a 'Who this is for / Who this isn't for' section early (within the first ~300 words) so readers can self-select.",
  },
  {
    category: "structure",
    title: "Internal linking strategy",
    body: "Link to the pod's pillar page and 2-3 sibling articles in the same pod. External links only to authoritative sources: .gov, CDC, State Department, the carrier pages we carry, or major news outlets. No links to competitor marketplaces (see commercial rules).",
  },
  {
    category: "structure",
    title: "No religious, political, or partisan content",
    body: "Avoid religious, political, or partisan commentary. Stick to travel and insurance.",
  },
];

/**
 * Idempotent seed. Inserts any rules whose `title` doesn't already exist in
 * the table. Safe to re-run.
 */
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const existing = await ctx.db.query("editorialRules").collect();
    const existingTitles = new Set(existing.map((r) => r.title));

    const inserted: string[] = [];
    const skipped: string[] = [];

    let order =
      existing.length > 0 ? Math.max(...existing.map((r) => r.order)) + 1 : 0;

    for (const rule of SEED_RULES) {
      if (existingTitles.has(rule.title)) {
        skipped.push(rule.title);
        continue;
      }
      await ctx.db.insert("editorialRules", {
        category: rule.category,
        title: rule.title,
        body: rule.body,
        isActive: true,
        order: order++,
        createdAt: now,
        updatedAt: now,
      });
      inserted.push(rule.title);
    }

    return { inserted: inserted.length, skipped: skipped.length, insertedTitles: inserted };
  },
});
