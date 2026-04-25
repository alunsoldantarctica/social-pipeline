import type { MutationCtx } from "../types";

type SeedRule = {
  category: "commercial" | "tone" | "legal" | "structure";
  title: string;
  body: string;
};

// TODO: Customize these rules for your niche and publication.
// These are example generic rules — edit them in the admin UI at /admin/content?tab=rules
// or change them here and re-run the migration.
const SEED_RULES: SeedRule[] = [
  // ===== COMMERCIAL =====
  {
    category: "commercial",
    title: "Always include a CTA",
    body: "Every article must include at least one call to action relevant to your product or service. Make it contextual — match the CTA to the article topic.",
  },
  {
    category: "commercial",
    title: "No fabricated pricing",
    body: "Never print specific prices unless they are verified and current. Direct readers to a pricing page or contact form instead of guessing.",
  },

  // ===== TONE =====
  {
    category: "tone",
    title: "Informative, not salesy",
    body: "Reader-serving, peer-to-peer expert tone. No fearmongering, no FOMO tactics, no high-pressure language. Assume the reader is sophisticated.",
  },
  {
    category: "tone",
    title: "US English, active voice, short paragraphs",
    body: "Use US English spelling. Prefer active voice. Keep paragraphs short (2-4 sentences). Avoid AI tells: em-dash overuse, 'in today\\'s fast-paced world', rule-of-three abuse, stacked conjunctive phrases ('moreover, furthermore, additionally').",
  },
  {
    category: "tone",
    title: "Define jargon on first use",
    body: "Define technical or domain-specific jargon the first time it appears. Do not assume the reader knows your industry's abbreviations.",
  },

  // ===== LEGAL =====
  {
    category: "legal",
    title: "No professional advice",
    body: "Frame content as general information, not legal, medical, or financial advice. Add appropriate disclaimers where relevant.",
  },
  {
    category: "legal",
    title: "No religious, political, or partisan content",
    body: "Avoid religious, political, or partisan commentary. Stay on-topic for your niche.",
  },

  // ===== STRUCTURE =====
  {
    category: "structure",
    title: "Hook within first 100 words",
    body: "The first 100 words must give the reader a clear reason to continue. State the problem, promise, or insight upfront.",
  },
  {
    category: "structure",
    title: "Internal linking strategy",
    body: "Link to the content pod's pillar page and 2-3 sibling articles in the same pod. External links only to authoritative sources.",
  },
];

export async function handler(ctx: MutationCtx): Promise<string> {
  const now = Date.now();
  const existing = await ctx.db.query("editorialRules").collect();
  const existingTitles = new Set(existing.map((r: any) => r.title));

  let order =
    existing.length > 0
      ? Math.max(...existing.map((r: any) => r.order as number)) + 1
      : 0;

  let inserted = 0;
  let skipped = 0;

  for (const rule of SEED_RULES) {
    if (existingTitles.has(rule.title)) {
      skipped++;
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
    inserted++;
  }

  return `Seeded editorial rules: ${inserted} inserted, ${skipped} skipped`;
}
