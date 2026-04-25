/**
 * Content Pods
 *
 * Topical pillars that group briefs + article workflows. Used for internal-
 * linking strategy and editorial planning. Each pod owns N sub-article briefs;
 * each brief can be triggered into the existing research→outline→draft pipeline.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

// ─── Queries ─────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const pods = await ctx.db.query("contentPods").collect();
    return pods.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const get = query({
  args: { id: v.id("contentPods") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("contentPods")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
  },
});

/** Return pods with their brief + workflow counts for admin display. */
export const listWithCounts = query({
  args: {},
  handler: async (ctx) => {
    const pods = await ctx.db.query("contentPods").collect();
    const result = [];
    for (const pod of pods) {
      const briefs = await ctx.db
        .query("contentBriefs")
        .withIndex("by_pod", (q) => q.eq("podId", pod._id))
        .collect();
      const workflows = await ctx.db
        .query("articleWorkflows")
        .withIndex("by_pod", (q) => q.eq("podId", pod._id))
        .collect();
      result.push({
        ...pod,
        briefsCount: briefs.length,
        workflowsCount: workflows.length,
        completedCount: workflows.filter((w) => w.status === "completed").length,
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    pillarKeyword: v.string(),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("contentPods", {
      name: args.name,
      slug: args.slug,
      description: args.description,
      pillarKeyword: args.pillarKeyword,
      isActive: args.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("contentPods"),
    patch: v.object({
      name: v.optional(v.string()),
      slug: v.optional(v.string()),
      name: v.optional(v.string()),
      slug: v.optional(v.string()),
      description: v.optional(v.string()),
      pillarKeyword: v.optional(v.string()),
      isActive: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    await ctx.db.patch(id, { ...patch, updatedAt: Date.now() });
  },
});

/**
 * Idempotent seed of example content pods. Customize slugs and keywords for your niche.
 * Safe to re-run.
 */
export const seedCorePods = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // TODO: Replace these with pods that match your niche.
    const pods = [
      {
        slug: "getting-started",
        name: "Getting Started",
        description: "Introductory content for new readers. Covers the basics of your topic.",
        pillarKeyword: "getting started",
        isActive: true,
      },
      {
        slug: "deep-dives",
        name: "Deep Dives",
        description: "Long-form expert content for readers who want to go beyond the basics.",
        pillarKeyword: "deep dive",
        isActive: true,
      },
    ];

    const seeded = [];
    for (const p of pods) {
      const existing = await ctx.db
        .query("contentPods")
        .withIndex("by_slug", (q) => q.eq("slug", p.slug))
        .first();
      if (existing) {
        seeded.push({ slug: p.slug, status: "existed", id: existing._id });
        continue;
      }
      const id = await ctx.db.insert("contentPods", {
        ...p,
        createdAt: now,
        updatedAt: now,
      });
      seeded.push({ slug: p.slug, status: "inserted", id });
    }
    return seeded;
  },
});

/**
 * List briefs scoped to a pod (or all pod-linked briefs if podId omitted).
 * Returns briefs joined with their pod metadata for the admin UI.
 */
export const listBriefs = query({
  args: { podId: v.optional(v.id("contentPods")) },
  handler: async (ctx, { podId }) => {
    const briefs = podId
      ? await ctx.db
          .query("contentBriefs")
          .withIndex("by_pod", (q) => q.eq("podId", podId))
          .collect()
      : await ctx.db.query("contentBriefs").collect();

    const pods = await ctx.db.query("contentPods").collect();
    const podMap = new Map(pods.map((p) => [p._id, p]));

    const postIds = Array.from(
      new Set(briefs.map((b) => b.blogPostId).filter(Boolean) as Array<(typeof briefs)[number]["blogPostId"] & {}>)
    );
    const postMap = new Map<string, { slug: string; title: string }>();
    for (const id of postIds) {
      const p = await ctx.db.get(id);
      if (p) postMap.set(String(id), { slug: p.slug, title: p.title });
    }

    return briefs
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((b) => ({
        _id: b._id,
        title: b.title,
        topic: b.topic,
        keywords: b.keywords,
        targetAudience: b.targetAudience,
        suggestedAngle: b.suggestedAngle,
        briefContent: b.briefContent,
        estimatedWordCount: b.estimatedWordCount,
        status: b.status,
        articleWorkflowId: b.articleWorkflowId,
        blogPostId: b.blogPostId,
        blogPostSlug: b.blogPostId ? postMap.get(String(b.blogPostId))?.slug ?? null : null,
        podId: b.podId,
        podName: b.podId ? podMap.get(b.podId)?.name ?? null : null,
        podSlug: b.podId ? podMap.get(b.podId)?.slug ?? null : null,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      }));
  },
});

/**
 * Convenience: flip a brief's status to "approved" (admin gate).
 */
export const approveBrief = mutation({
  args: { id: v.id("contentBriefs") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { status: "approved", updatedAt: Date.now() });
  },
});

export const rejectBrief = mutation({
  args: { id: v.id("contentBriefs") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { status: "rejected", updatedAt: Date.now() });
  },
});

/**
 * Idempotent seed of draft briefs for each pod. Briefs are in status
 * "generated" — admin can review and flip to "approved" to trigger the
 * existing research pipeline.
 *
 * Deduplicated by exact (podId, title) pair.
 */
export const seedPodBriefs = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const pods = await ctx.db.query("contentPods").collect();
    const slugToId: Record<string, any> = {};
    for (const p of pods) slugToId[p.slug] = p._id;

    type BriefDraft = {
      podSlug: string;
      title: string;
      keywords: string[];
      suggestedAngle: string;
      estimatedWordCount?: number;
    };

    const drafts: BriefDraft[] = [
      // Antarctic & Polar
      { podSlug: "antarctic-polar", title: "Antarctica Travel Insurance: 2026 Complete Guide", keywords: ["antarctica travel insurance", "polar insurance", "cruise insurance antarctica"], suggestedAngle: "Buyer's guide covering what coverage gaps kill trips — unlike cruise-marketplace reviews, frame around expedition-specific risks" },
      { podSlug: "antarctic-polar", title: "Medical Evacuation from Antarctica: Cost, Logistics, What to Cover", keywords: ["antarctica medical evacuation", "polar evac cost", "emergency evacuation antarctica"], suggestedAngle: "Hard numbers — real evac cost ($100k+), helicopter→King George Island→Punta Arenas chain, why $250k is the floor" },
      { podSlug: "antarctic-polar", title: "Quark Expeditions Travel Protection Plan: Is Trip Mate Enough?", keywords: ["quark travel protection", "trip mate quark", "quark insurance review"], suggestedAngle: "Side-by-side vs independent plans — show where Trip Mate coverage falls short for $20k+ trips" },
      { podSlug: "antarctic-polar", title: "Hurtigruten HX Insurance Requirements Explained", keywords: ["hurtigruten hx insurance", "hurtigruten travel insurance", "hx expedition requirements"], suggestedAngle: "Operator-required coverage minimums + recommended extras" },
      { podSlug: "antarctic-polar", title: "Aurora Expeditions $250K Minimum: Why Operators Require It", keywords: ["aurora expeditions insurance", "aurora travel insurance minimum", "polar operator requirements"], suggestedAngle: "Explain the $250k evac floor from an operator's POV + how to meet it" },
      { podSlug: "antarctic-polar", title: "Fly-Cruise to Antarctica: What Happens When Weather Cancels", keywords: ["antarctica fly cruise weather", "fly cruise cancellation", "antarctica weather insurance"], suggestedAngle: "Specific to fly-cruise itineraries — delayed departures from Punta Arenas, CFAR vs carrier credit" },
      { podSlug: "antarctic-polar", title: "Svalbard & Arctic Expedition Insurance: What's Different From Antarctica", keywords: ["svalbard insurance", "arctic expedition insurance", "arctic travel cover"], suggestedAngle: "Longyearbyen logistics, polar bear safety, different evac routes" },
      { podSlug: "antarctic-polar", title: "Expedition Insurance for Travelers Over 70", keywords: ["expedition insurance seniors", "antarctic cruise seniors", "polar insurance over 70"], suggestedAngle: "Age-band pricing, medical screening, Hurtigruten/Quark age limits, pre-existing look-back" },

      // African Safari
      { podSlug: "african-safari", title: "Safari Travel Insurance: Botswana, Namibia & the Okavango Delta", keywords: ["botswana safari insurance", "okavango insurance", "namibia travel insurance"], suggestedAngle: "Remote-camp medical evac + adventure-activity endorsements" },
      { podSlug: "african-safari", title: "Gorilla Trekking Insurance: Uganda & Rwanda Permit Requirements", keywords: ["gorilla trekking insurance", "uganda rwanda travel insurance", "bwindi insurance"], suggestedAngle: "Permit-cost protection, altitude evac, trekking-specific activity riders" },
      { podSlug: "african-safari", title: "Kenya & Tanzania Safari Insurance: Medical Coverage for the Serengeti", keywords: ["kenya travel insurance", "tanzania safari insurance", "serengeti insurance"], suggestedAngle: "Cross-border considerations, flying doctor service, remote camp logistics" },
      { podSlug: "african-safari", title: "Malaria Evacuation: When Safari Insurance Actually Covers You", keywords: ["malaria travel insurance", "tropical disease evacuation", "safari medical cover"], suggestedAngle: "What 'medical evac' means when malaria hits — coverage realities and denial patterns" },
      { podSlug: "african-safari", title: "South Africa & Zambia Safari Insurance: Victoria Falls Adventure Coverage", keywords: ["south africa safari insurance", "zambia travel insurance", "victoria falls insurance"], suggestedAngle: "Adventure-activity endorsements (bungee/rafting), cross-border coverage" },
      { podSlug: "african-safari", title: "Mobile Safari Insurance: What Walking & Horseback Trips Require", keywords: ["mobile safari insurance", "walking safari insurance", "horseback safari coverage"], suggestedAngle: "Higher-risk safari styles need specific adventure riders most policies exclude by default" },

      // Galapagos
      { podSlug: "galapagos", title: "Galapagos Expedition Insurance: What Ecuador Requires", keywords: ["galapagos insurance", "ecuador travel insurance", "galapagos entry requirements"], suggestedAngle: "$2k min coverage requirement, park fees, yacht operator specifics" },
      { podSlug: "galapagos", title: "Galapagos Live-Aboard Insurance: Boat vs Land-Based Trip Differences", keywords: ["galapagos cruise insurance", "live aboard galapagos", "galapagos boat insurance"], suggestedAngle: "Boat-specific risks (disability/evac at sea), trip-cancellation for yacht maintenance" },
      { podSlug: "galapagos", title: "Galapagos Snorkeling & Diving: Adventure Activity Coverage", keywords: ["galapagos diving insurance", "snorkel insurance ecuador", "galapagos activity cover"], suggestedAngle: "Diver-specific coverage, DAN insurance interactions, depth limits" },
      { podSlug: "galapagos", title: "Galapagos Trip Cancellation: Weather, Fuel Strikes, and Park Closures", keywords: ["galapagos cancellation", "galapagos trip interruption", "ecuador travel disruption"], suggestedAngle: "Real cancellation scenarios from 2024-2026 + coverage outcomes" },

      // Expedition Cruise
      { podSlug: "expedition-cruise", title: "Expedition Cruise Insurance vs Mainstream Cruise Insurance", keywords: ["expedition cruise insurance", "small ship cruise insurance", "expedition vs mainstream cruise"], suggestedAngle: "The gap between Princess/Royal Caribbean policies and what expedition trips actually need" },
      { podSlug: "expedition-cruise", title: "Silversea Expedition & Nat Geo Insurance: Reading the Fine Print", keywords: ["silversea expedition insurance", "nat geo lindblad insurance", "luxury expedition cover"], suggestedAngle: "Included vs optional carrier insurance for luxury expedition lines" },
      { podSlug: "expedition-cruise", title: "What Happens If Your Expedition Ship Gets Stuck in Ice", keywords: ["ship stuck ice insurance", "expedition cruise interruption", "polar ice insurance"], suggestedAngle: "Historical incidents + what coverage kicks in (extra accommodation, charter flights home)" },
      { podSlug: "expedition-cruise", title: "Expedition Cruise CFAR: When $1,400 Extra Is Worth It", keywords: ["cfar expedition cruise", "cancel for any reason cruise", "expedition cruise cfar"], suggestedAngle: "Break-even math for CFAR on $30k+ cruises; real claim examples" },
      { podSlug: "expedition-cruise", title: "Expedition Cruise Pre-Departure Insurance Timing", keywords: ["when buy expedition cruise insurance", "cfar 21 day window", "expedition cruise insurance timing"], suggestedAngle: "Why buying within 21 days of deposit unlocks CFAR + pre-existing waivers" },
      { podSlug: "expedition-cruise", title: "Credit Card Travel Insurance vs. Expedition Insurance: Why Sapphire Reserve Isn't Enough", keywords: ["sapphire reserve expedition", "credit card insurance expedition", "chase insurance polar"], suggestedAngle: "Specific coverage gaps on $10k+ expedition trips — evac caps, activity exclusions" },

      // CFAR
      { podSlug: "cfar-expedition", title: "CFAR Insurance for Expedition Cruises: Is It Worth $1,400?", keywords: ["cfar insurance", "cancel for any reason expedition", "cfar cost benefit"], suggestedAngle: "Break-even math, reimbursement percentages (typically 75%), claim denial patterns" },
      { podSlug: "cfar-expedition", title: "The 21-Day Window: When CFAR Actually Unlocks", keywords: ["cfar 21 day window", "cfar purchase window", "when does cfar apply"], suggestedAngle: "Most travelers miss the window — explain initial-deposit rule + final-payment scenarios" },
      { podSlug: "cfar-expedition", title: "CFAR Exclusions You Didn't Know About", keywords: ["cfar exclusions", "cfar fine print", "cfar denial"], suggestedAngle: "Partial refund cap, blackout activities, claim-documentation requirements" },
      { podSlug: "cfar-expedition", title: "Pre-Existing Conditions & the 14-Day Rule for Expedition Travelers", keywords: ["pre-existing conditions insurance", "14 day pre-existing rule", "pre-existing expedition insurance"], suggestedAngle: "The look-back period, how to get the waiver, what 'stable' means for chronic conditions" },
      { podSlug: "cfar-expedition", title: "CFAR vs Trip Cancellation: What Actually Covers a Last-Minute Change of Heart", keywords: ["cfar vs trip cancellation", "trip cancellation covered reasons", "cancel trip insurance"], suggestedAngle: "Side-by-side comparison — what each covers + example claim narratives" },
    ];

    const inserted: string[] = [];
    const skipped: string[] = [];

    for (const d of drafts) {
      const podId = slugToId[d.podSlug];
      if (!podId) {
        skipped.push(`${d.podSlug}/${d.title}: pod not found`);
        continue;
      }

      const existing = await ctx.db
        .query("contentBriefs")
        .withIndex("by_pod", (q) => q.eq("podId", podId))
        .collect();
      if (existing.some((e) => e.title === d.title)) {
        skipped.push(`${d.title}: exists`);
        continue;
      }

      await ctx.db.insert("contentBriefs", {
        title: d.title,
        topic: d.title,
        keywords: d.keywords,
        targetAudience: "High-intent expedition travelers (Antarctic, Arctic, safari, Galapagos) who are comparing providers",
        competitorGap: "See associated pod description for competitive landscape",
        suggestedAngle: d.suggestedAngle,
        competitorCoverage: [],
        briefContent: `Seed brief for pod. Expand with competitor research before triggering the pipeline.\n\nSuggested angle: ${d.suggestedAngle}\n\nTarget keywords: ${d.keywords.join(", ")}`,
        estimatedWordCount: d.estimatedWordCount ?? 1800,
        status: "generated" as const,
        podId,
        createdAt: now,
        updatedAt: now,
      });
      inserted.push(d.title);
    }

    return { inserted: inserted.length, skipped: skipped.length, insertedTitles: inserted, skippedReasons: skipped };
  },
});
